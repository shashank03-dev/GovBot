"""Shared Gemini access with multi-key rotation and client-side rate limiting.

Google applies Gemini rate limits per Google Cloud *project*, not per API key,
so extra keys only add quota when they come from different projects.

Each (key, model) pair is a "slot" with its own budget:

* RPM: a 60-second sliding window, checked before every call.
* RPD: a per-day counter that resets at midnight Pacific time, like Google's.
* Cooldown: after a 429 the slot is parked for Google's ``retryDelay`` (or until
  the next Pacific midnight when a per-day quota ran out).

A request tries every key on the first model before moving to the next model,
so the preferred model is used as long as any project still has quota. When
every slot is exhausted the call fails fast with ``GeminiRateLimitError`` instead
of sleeping, and callers fall back to OCR or canned replies.
"""

from __future__ import annotations

import base64
import logging
import re
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any, Callable
from zoneinfo import ZoneInfo

from google import genai
from google.genai import types

from gov_agent.config import (
    GEMINI_API_KEYS,
    GEMINI_EMBEDDING_MODEL,
    GEMINI_GENERATION_MODELS,
    GEMINI_RATE_LIMITS,
)

# Stable, fast, image-capable and cheap; no shutdown date announced as of 2026-11.
DEFAULT_GENERATION_MODELS = ("gemini-3.5-flash-lite", "gemini-2.5-flash-lite")
DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001"

# Conservative per-project budgets (RPM, RPD). Google no longer publishes free-tier
# numbers per model, so check AI Studio -> Rate limits and override with
# GEMINI_RATE_LIMITS="model=rpm/rpd,..." when your project shows different values.
DEFAULT_RATE_LIMITS: dict[str, tuple[int, int]] = {
    "gemini-3.5-flash-lite": (15, 500),
    "gemini-2.5-flash-lite": (15, 1000),
    "gemini-embedding-001": (100, 1000),
}
FALLBACK_RATE_LIMIT = (10, 250)

DEFAULT_COOLDOWN_SECONDS = 60.0
UNAVAILABLE_COOLDOWN_SECONDS = 15.0
MISSING_MODEL_COOLDOWN_SECONDS = 3600.0

# Errors caused by the request itself: retrying on another key or model would
# burn quota for the same failure.
NON_RETRIABLE_ERROR_MARKERS = (
    "INVALID_ARGUMENT",
    "UNABLE TO PROCESS INPUT IMAGE",
    "PERMISSION_DENIED",
    "API_KEY_INVALID",
)

_PACIFIC = ZoneInfo("America/Los_Angeles")
_RETRY_DELAY_PATTERNS = (
    re.compile(r"retryDelay['\"]?\s*[:=]\s*['\"]?(\d+(?:\.\d+)?)s", re.IGNORECASE),
    re.compile(r"retry in (\d+(?:\.\d+)?)\s*s", re.IGNORECASE),
)

logger = logging.getLogger(__name__)


class GeminiRateLimitError(RuntimeError):
    """Every key/model slot is out of quota or cooling down."""

    def __init__(self, message: str):
        # Keep the upstream marker so provider error classification sees a 429.
        super().__init__(f"RESOURCE_EXHAUSTED: {message}")


def _parse_rate_limits(raw: str) -> dict[str, tuple[int, int]]:
    limits = dict(DEFAULT_RATE_LIMITS)
    for entry in raw.split(","):
        entry = entry.strip()
        if not entry:
            continue
        try:
            model, budget = entry.split("=", 1)
            rpm, rpd = budget.split("/", 1)
            limits[model.strip()] = (max(1, int(rpm)), max(1, int(rpd)))
        except ValueError:
            logger.warning("Ignoring malformed GEMINI_RATE_LIMITS entry: %r", entry)
    return limits


def _split_models(raw: str) -> list[str]:
    models: list[str] = []
    for item in raw.split(","):
        model = item.strip()
        if model and model not in models:
            models.append(model)
    return models


def _seconds_until_pacific_midnight(now: float) -> float:
    local = datetime.fromtimestamp(now, _PACIFIC)
    tomorrow = (local + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return max(1.0, tomorrow.timestamp() - now)


def _pacific_day(now: float) -> str:
    return datetime.fromtimestamp(now, _PACIFIC).strftime("%Y-%m-%d")


def _error_text(exc: Exception) -> str:
    return f"{type(exc).__name__}: {exc}"


def _is_rate_limit_error(exc: Exception) -> bool:
    text = _error_text(exc).upper()
    return "RESOURCE_EXHAUSTED" in text or "429" in text or "RATE LIMIT" in text


def _is_non_retriable(exc: Exception) -> bool:
    text = _error_text(exc).upper()
    return any(marker in text for marker in NON_RETRIABLE_ERROR_MARKERS)


def _is_missing_model(exc: Exception) -> bool:
    text = _error_text(exc).upper()
    return "NOT_FOUND" in text or "404" in text


def _rate_limit_cooldown(exc: Exception, now: float) -> float:
    text = _error_text(exc)
    if "PerDay" in text or "per day" in text.lower():
        return _seconds_until_pacific_midnight(now)
    for pattern in _RETRY_DELAY_PATTERNS:
        match = pattern.search(text)
        if match:
            return max(1.0, float(match.group(1)))
    return DEFAULT_COOLDOWN_SECONDS


@dataclass
class _Slot:
    key_index: int
    model: str
    rpm: int
    rpd: int
    recent: deque[float] = field(default_factory=deque)
    day: str = ""
    day_count: int = 0
    cooldown_until: float = 0.0

    def try_reserve(self, now: float) -> bool:
        if self.cooldown_until > now:
            return False
        today = _pacific_day(now)
        if self.day != today:
            self.day, self.day_count = today, 0
        if self.day_count >= self.rpd:
            return False
        while self.recent and now - self.recent[0] >= 60.0:
            self.recent.popleft()
        if len(self.recent) >= self.rpm:
            return False
        self.recent.append(now)
        self.day_count += 1
        return True


class GeminiPool:
    def __init__(
        self,
        api_keys: list[str],
        *,
        rate_limits: dict[str, tuple[int, int]] | None = None,
        client_factory: Callable[[str], Any] | None = None,
        clock: Callable[[], float] = time.time,
    ):
        self._api_keys = [key for key in api_keys if key]
        self._rate_limits = rate_limits if rate_limits is not None else dict(DEFAULT_RATE_LIMITS)
        self._client_factory = client_factory or (lambda key: genai.Client(api_key=key))
        self._clients: dict[int, Any] = {}
        self._slots: dict[tuple[int, str], _Slot] = {}
        self._next_key = 0
        self._clock = clock
        self._lock = threading.Lock()

    @property
    def key_count(self) -> int:
        return len(self._api_keys)

    def _client(self, key_index: int) -> Any:
        with self._lock:
            client = self._clients.get(key_index)
            if client is None:
                client = self._client_factory(self._api_keys[key_index])
                self._clients[key_index] = client
            return client

    def _slot(self, key_index: int, model: str) -> _Slot:
        slot = self._slots.get((key_index, model))
        if slot is None:
            rpm, rpd = self._rate_limits.get(model, FALLBACK_RATE_LIMIT)
            slot = _Slot(key_index=key_index, model=model, rpm=rpm, rpd=rpd)
            self._slots[(key_index, model)] = slot
        return slot

    def _key_order(self) -> list[int]:
        # Rotate the starting key so traffic spreads across projects.
        with self._lock:
            start = self._next_key
            self._next_key = (self._next_key + 1) % max(1, len(self._api_keys))
        return [(start + offset) % len(self._api_keys) for offset in range(len(self._api_keys))]

    def _reserve(self, key_index: int, model: str) -> bool:
        with self._lock:
            return self._slot(key_index, model).try_reserve(self._clock())

    def _cool_down(self, key_index: int, model: str, seconds: float) -> None:
        with self._lock:
            slot = self._slot(key_index, model)
            slot.cooldown_until = max(slot.cooldown_until, self._clock() + seconds)

    def call(self, models: list[str], operation: Callable[[Any, str], Any]) -> Any:
        """Run ``operation(client, model)`` on the first slot with quota left."""
        if not self._api_keys:
            raise RuntimeError("GEMINI_API_KEY is not configured")
        if not models:
            raise RuntimeError("No Gemini models configured")

        last_exc: Exception | None = None
        attempted = False
        for model in models:
            for key_index in self._key_order():
                if not self._reserve(key_index, model):
                    continue
                attempted = True
                try:
                    return operation(self._client(key_index), model)
                except Exception as exc:  # noqa: BLE001 - classified below
                    last_exc = exc
                    if _is_non_retriable(exc):
                        logger.warning("gemini key=%s model=%s non-retriable error: %s", key_index + 1, model, exc)
                        raise
                    if _is_rate_limit_error(exc):
                        cooldown = _rate_limit_cooldown(exc, self._clock())
                    elif _is_missing_model(exc):
                        cooldown = MISSING_MODEL_COOLDOWN_SECONDS
                    else:
                        cooldown = UNAVAILABLE_COOLDOWN_SECONDS
                    self._cool_down(key_index, model, cooldown)
                    logger.warning(
                        "gemini key=%s model=%s failed (cooldown %.0fs), trying next slot: %s",
                        key_index + 1,
                        model,
                        cooldown,
                        exc,
                    )

        if last_exc is not None and not _is_rate_limit_error(last_exc):
            raise last_exc
        reason = "all keys and models are rate limited" if attempted else "client-side budget exhausted"
        raise GeminiRateLimitError(f"Gemini unavailable: {reason}")


_pool: GeminiPool | None = None
_pool_lock = threading.Lock()


def get_gemini_pool() -> GeminiPool:
    global _pool
    with _pool_lock:
        if _pool is None:
            _pool = GeminiPool(
                list(GEMINI_API_KEYS),
                rate_limits=_parse_rate_limits(GEMINI_RATE_LIMITS),
            )
        return _pool


def has_gemini_client() -> bool:
    return bool(GEMINI_API_KEYS)


def configured_generation_models() -> list[str]:
    return _split_models(GEMINI_GENERATION_MODELS) or list(DEFAULT_GENERATION_MODELS)


def _generation_models_for_request(model: str | None) -> list[str]:
    configured = configured_generation_models()
    if not model:
        return configured
    return [model, *[candidate for candidate in configured if candidate != model]]


def inline_data_part(*, data_b64: str, mime_type: str) -> types.Part:
    return types.Part.from_bytes(
        data=base64.b64decode(data_b64),
        mime_type=mime_type,
    )


def generate_text(
    contents: Any,
    *,
    model: str | None = None,
    system_instruction: str | None = None,
    response_mime_type: str | None = None,
    temperature: float | None = None,
    max_output_tokens: int | None = None,
) -> str:
    config_kwargs: dict[str, Any] = {}
    if system_instruction:
        config_kwargs["system_instruction"] = system_instruction
    if response_mime_type:
        config_kwargs["response_mime_type"] = response_mime_type
    if temperature is not None:
        config_kwargs["temperature"] = temperature
    if max_output_tokens is not None:
        config_kwargs["max_output_tokens"] = max_output_tokens
    config = types.GenerateContentConfig(**config_kwargs) if config_kwargs else None

    def _generate(client: Any, candidate_model: str) -> str:
        response = client.models.generate_content(
            model=candidate_model,
            contents=contents,
            config=config,
        )
        return (response.text or "").strip()

    return get_gemini_pool().call(_generation_models_for_request(model), _generate)


def embed_text(
    content: Any,
    *,
    model: str | None = None,
    task_type: str | None = None,
) -> list[float]:
    config = types.EmbedContentConfig(task_type=task_type) if task_type else None

    def _embed(client: Any, candidate_model: str) -> list[float]:
        response = client.models.embed_content(
            model=candidate_model,
            contents=content,
            config=config,
        )
        embeddings = list(response.embeddings or [])
        if not embeddings:
            raise ValueError("Gemini returned no embeddings")
        return list(embeddings[0].values)

    # No cross-model fallback: vectors from another model don't match the index.
    return get_gemini_pool().call([model or GEMINI_EMBEDDING_MODEL or DEFAULT_EMBEDDING_MODEL], _embed)
