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

# Measured 2026-11-17 on image extraction: 3.1 Flash-Lite median 2.6s, 3.5 Flash-Lite
# 4.6s, same answers; 3.1 is also cheaper. 2.5 Flash-Lite returns 404 for new users.
DEFAULT_GENERATION_MODELS = ("gemini-3.1-flash-lite", "gemini-3.5-flash-lite")
DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001"

# Conservative per-project budgets (RPM, RPD). Google no longer publishes free-tier
# numbers per model, so check AI Studio -> Rate limits and override with
# GEMINI_RATE_LIMITS="model=rpm/rpd,..." when your project shows different values.
DEFAULT_RATE_LIMITS: dict[str, tuple[int, int]] = {
    "gemini-3.1-flash-lite": (15, 500),
    "gemini-3.5-flash-lite": (15, 500),
    "gemini-embedding-001": (100, 1000),
}
FALLBACK_RATE_LIMIT = (10, 250)

DEFAULT_COOLDOWN_SECONDS = 60.0
UNAVAILABLE_COOLDOWN_SECONDS = 15.0
REQUEST_TIMEOUT_MS = 30_000
# Per-attempt cap so a stalled request (Google sometimes holds one for 8s+ before
# a 504) moves on to the next key instead of eating the whole reply budget.
DEFAULT_ATTEMPT_TIMEOUT_MS = 20_000
MISSING_MODEL_COOLDOWN_SECONDS = 3600.0

BAD_KEY_COOLDOWN_SECONDS = 3600.0

# Error kinds, decided by _classify_error:
#   input       - the input itself is unusable; no slot can succeed, so stop.
#   bad_request - this model rejected the request; another model may accept it.
#   bad_key     - this key/project is unusable; bench it for every model.
#   rate_limit  - this slot is out of quota; cool it down per Google's hint.
#   missing     - this model isn't served for this key; bench the slot.
#   unavailable - transient upstream failure; short cooldown, try next slot.
_INPUT_ERROR_MARKERS = ("UNABLE TO PROCESS INPUT IMAGE",)
_BAD_KEY_MARKERS = ("PERMISSION_DENIED", "API_KEY_INVALID", "API KEY NOT VALID", "UNAUTHENTICATED")
_STATUS_CODE_PATTERN = re.compile(r"\b(400|401|403|404|429)\b")

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


def _status_code(exc: Exception) -> int | None:
    code = getattr(exc, "code", None)  # google.genai.errors.APIError
    if isinstance(code, int):
        return code
    match = _STATUS_CODE_PATTERN.search(str(exc)[:16])  # e.g. "429 RESOURCE_EXHAUSTED ..."
    return int(match.group(1)) if match else None


def _classify_error(exc: Exception) -> str:
    text = _error_text(exc).upper()
    code = _status_code(exc)
    if any(marker in text for marker in _INPUT_ERROR_MARKERS):
        return "input"
    if code == 429 or "RESOURCE_EXHAUSTED" in text or "RATE LIMIT" in text:
        return "rate_limit"
    if code in (401, 403) or any(marker in text for marker in _BAD_KEY_MARKERS):
        return "bad_key"
    if code == 404 or "NOT_FOUND" in text:
        return "missing"
    if code == 400 or "INVALID_ARGUMENT" in text:
        return "bad_request"
    return "unavailable"


def _is_rate_limit_error(exc: Exception) -> bool:
    return _classify_error(exc) == "rate_limit"


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

    def refund(self, reserved_at: float) -> None:
        # Google doesn't count requests it rejects with 429, so neither do we.
        try:
            self.recent.remove(reserved_at)
        except ValueError:
            pass
        if self.day == _pacific_day(reserved_at) and self.day_count > 0:
            self.day_count -= 1


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
        # No SDK-level retries: the pool decides where to retry, and fails fast.
        self._client_factory = client_factory or (
            lambda key: genai.Client(api_key=key, http_options=types.HttpOptions(timeout=REQUEST_TIMEOUT_MS))
        )
        self._clients: dict[int, Any] = {}
        self._slots: dict[tuple[int, str], _Slot] = {}
        self._key_benched_until: dict[int, float] = {}
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

    def _reserve(self, key_index: int, model: str) -> float | None:
        """Reserve budget on a slot; returns the reservation time, or None."""
        with self._lock:
            now = self._clock()
            if self._key_benched_until.get(key_index, 0.0) > now:
                return None
            return now if self._slot(key_index, model).try_reserve(now) else None

    def _refund(self, key_index: int, model: str, reserved_at: float) -> None:
        with self._lock:
            self._slot(key_index, model).refund(reserved_at)

    def _cool_down(self, key_index: int, model: str, seconds: float) -> None:
        with self._lock:
            slot = self._slot(key_index, model)
            slot.cooldown_until = max(slot.cooldown_until, self._clock() + seconds)

    def _bench_key(self, key_index: int, seconds: float) -> None:
        with self._lock:
            until = self._clock() + seconds
            self._key_benched_until[key_index] = max(self._key_benched_until.get(key_index, 0.0), until)

    def call(self, models: list[str], operation: Callable[[Any, str], Any]) -> Any:
        """Run ``operation(client, model)`` on the first slot with quota left."""
        if not self._api_keys:
            raise RuntimeError("GEMINI_API_KEY is not configured")
        if not models:
            raise RuntimeError("No Gemini models configured")

        last_exc: Exception | None = None
        attempted = False
        key_order = self._key_order()  # rotate once per request, not per model
        for model in models:
            for key_index in key_order:
                reserved_at = self._reserve(key_index, model)
                if reserved_at is None:
                    continue
                attempted = True
                try:
                    return operation(self._client(key_index), model)
                except Exception as exc:  # noqa: BLE001 - classified below
                    last_exc = exc
                    kind = _classify_error(exc)
                    log_args = (key_index + 1, model, kind, exc)
                    if kind == "input":
                        logger.warning("gemini key=%s model=%s %s error, not retrying: %s", *log_args)
                        raise
                    if kind == "bad_request":
                        # Same request on another key fails the same way; try the next model.
                        logger.warning("gemini key=%s model=%s %s error, trying next model: %s", *log_args)
                        break
                    if kind == "bad_key":
                        self._bench_key(key_index, BAD_KEY_COOLDOWN_SECONDS)
                    elif kind == "rate_limit":
                        self._refund(key_index, model, reserved_at)
                        self._cool_down(key_index, model, _rate_limit_cooldown(exc, self._clock()))
                    elif kind == "missing":
                        self._cool_down(key_index, model, MISSING_MODEL_COOLDOWN_SECONDS)
                    else:
                        self._cool_down(key_index, model, UNAVAILABLE_COOLDOWN_SECONDS)
                    logger.warning("gemini key=%s model=%s %s error, trying next slot: %s", *log_args)

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
    timeout_ms: int | None = None,
) -> str:
    config_kwargs: dict[str, Any] = {
        "http_options": types.HttpOptions(timeout=timeout_ms or DEFAULT_ATTEMPT_TIMEOUT_MS),
    }
    if system_instruction:
        config_kwargs["system_instruction"] = system_instruction
    if response_mime_type:
        config_kwargs["response_mime_type"] = response_mime_type
    if temperature is not None:
        config_kwargs["temperature"] = temperature
    if max_output_tokens is not None:
        config_kwargs["max_output_tokens"] = max_output_tokens
    config = types.GenerateContentConfig(**config_kwargs)

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
