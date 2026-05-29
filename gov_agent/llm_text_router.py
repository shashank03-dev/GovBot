from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any

from gov_agent.config import GEMINI_API_KEY, load_text_provider_env_configs
from gov_agent.providers.base import ProviderCallError, ProviderConfig

logger = logging.getLogger(__name__)

_DEFAULT_LATENCY_MS = {
    "groq": 80.0,
    "gemini": 140.0,
    "mistral": 180.0,
}
_INTERACTIVE_TIMEOUT_SECONDS = 2.5


@dataclass
class ProviderRuntimeState:
    latency_ms: float = 0.0
    failure_count: int = 0
    request_count: int = 0
    cooldown_until: float = 0.0


class LLMTextRouter:
    def __init__(
        self,
        *,
        providers: list[ProviderConfig],
        provider_clients: dict[str, Any],
        cache_ttl_seconds: int = 15,
        cache_max_entries: int = 256,
    ):
        self._providers = providers
        self._provider_clients = provider_clients
        self._provider_lookup = {config.name: config for config in providers}
        self._provider_state = {
            config.name: ProviderRuntimeState() for config in providers
        }
        self._cache_ttl_seconds = cache_ttl_seconds
        self._cache_max_entries = max(1, cache_max_entries)
        self._cache: OrderedDict[str, tuple[float, str]] = OrderedDict()

    async def generate_text(
        self,
        prompt: str,
        *,
        task: str = "interactive",
        system_instruction: str | None = None,
        temperature: float | None = None,
        max_output_tokens: int | None = None,
    ) -> str:
        cache_key = self._cache_key(
            prompt,
            task,
            system_instruction,
            temperature,
            max_output_tokens,
        )
        cached = self._cache.get(cache_key)
        now = time.monotonic()
        self._prune_cache(now)
        if cached and cached[0] > now:
            self._cache.move_to_end(cache_key)
            logger.info("text_router cache_hit=true task=%s", task)
            return cached[1]

        candidates = self._pick_candidates()
        if not candidates:
            raise RuntimeError("No text providers configured")

        max_attempts = len(candidates)
        last_error: Exception | None = None
        for attempt_index, provider in enumerate(candidates[:max_attempts], start=1):
            started_at = time.monotonic()
            try:
                text = await asyncio.wait_for(
                    self._provider_clients[provider.name].generate_text(
                        prompt,
                        system_instruction=system_instruction,
                        temperature=temperature,
                        max_output_tokens=max_output_tokens,
                    ),
                    timeout=_INTERACTIVE_TIMEOUT_SECONDS,
                )
                self._record_success(provider.name, started_at)
                self._cache[cache_key] = (
                    time.monotonic() + self._cache_ttl_seconds,
                    text,
                )
                self._cache.move_to_end(cache_key)
                self._prune_cache(time.monotonic())
                latency_ms = self._provider_state[provider.name].latency_ms
                logger.info(
                    "text_router provider=%s model=%s latency_ms=%.2f cache_hit=false failover_count=%s",
                    provider.name,
                    provider.model,
                    latency_ms,
                    attempt_index - 1,
                )
                return text
            except asyncio.TimeoutError as exc:
                last_error = ProviderCallError("Timed out", kind="timeout")
                self._record_failure(provider.name, last_error)
            except ProviderCallError as exc:
                last_error = exc
                self._record_failure(provider.name, exc)

        raise last_error or RuntimeError("Text generation failed")

    def _pick_candidates(self) -> list[ProviderConfig]:
        now = time.monotonic()
        healthy = []
        for provider in self._providers:
            state = self._provider_state[provider.name]
            if state.cooldown_until > now:
                continue
            healthy.append(provider)
        return sorted(healthy, key=self._score_provider, reverse=True)

    def _prune_cache(self, now: float) -> None:
        expired_keys = [key for key, (expires_at, _) in self._cache.items() if expires_at <= now]
        for key in expired_keys:
            self._cache.pop(key, None)
        while len(self._cache) > self._cache_max_entries:
            self._cache.popitem(last=False)

    def _score_provider(self, provider: ProviderConfig) -> float:
        state = self._provider_state[provider.name]
        latency_ms = state.latency_ms or _DEFAULT_LATENCY_MS.get(provider.provider, 200.0)
        score = provider.weight * 100.0
        score -= state.failure_count * 25.0
        score -= latency_ms / 10.0
        return score

    def _record_success(self, provider_name: str, started_at: float) -> None:
        state = self._provider_state[provider_name]
        latency_ms = (time.monotonic() - started_at) * 1000
        state.request_count += 1
        state.failure_count = 0
        if state.latency_ms:
            state.latency_ms = (state.latency_ms * 0.5) + (latency_ms * 0.5)
        else:
            state.latency_ms = latency_ms
        state.cooldown_until = 0.0

    def _record_failure(self, provider_name: str, error: ProviderCallError) -> None:
        state = self._provider_state[provider_name]
        provider = self._provider_lookup[provider_name]
        state.failure_count += 1
        if error.kind == "rate_limited":
            cooldown_seconds = min(60, 5 * state.failure_count)
            state.cooldown_until = time.monotonic() + cooldown_seconds
        elif error.kind == "timeout":
            state.cooldown_until = time.monotonic() + 3
        logger.warning(
            "text_router provider=%s model=%s error_type=%s cooldown_until=%.2f",
            provider.name,
            provider.model,
            error.kind,
            state.cooldown_until,
        )

    @staticmethod
    def _cache_key(
        prompt: str,
        task: str,
        system_instruction: str | None,
        temperature: float | None,
        max_output_tokens: int | None,
    ) -> str:
        return json.dumps(
            {
                "prompt": prompt,
                "task": task,
                "system_instruction": system_instruction,
                "temperature": temperature,
                "max_output_tokens": max_output_tokens,
            },
            sort_keys=True,
        )


_TEXT_ROUTER: LLMTextRouter | None = None


def _build_provider_configs() -> list[ProviderConfig]:
    env_configs = load_text_provider_env_configs()
    providers: list[ProviderConfig] = []
    for config in env_configs:
        api_key = os.getenv(config.api_key_env, "").strip()
        if not config.enabled or not api_key:
            continue
        providers.append(
            ProviderConfig(
                name=config.name,
                provider=config.provider,
                model=config.model,
                api_key=api_key,
                enabled=config.enabled,
                weight=config.weight,
            )
        )
    if providers:
        return providers
    if GEMINI_API_KEY:
        return [
            ProviderConfig(
                name="legacy-gemini",
                provider="gemini",
                model="gemini-2.0-flash",
                api_key=GEMINI_API_KEY,
                enabled=True,
                weight=1,
            )
        ]
    return []


def _build_provider_clients(providers: list[ProviderConfig]) -> dict[str, Any]:
    clients: dict[str, Any] = {}
    for provider in providers:
        if provider.provider == "gemini":
            from gov_agent.providers.gemini_provider import GeminiTextProvider

            clients[provider.name] = GeminiTextProvider(
                api_key=provider.api_key,
                model=provider.model,
            )
        elif provider.provider == "groq":
            from gov_agent.providers.groq_provider import GroqTextProvider

            clients[provider.name] = GroqTextProvider(
                api_key=provider.api_key,
                model=provider.model,
            )
        elif provider.provider == "mistral":
            from gov_agent.providers.mistral_provider import MistralTextProvider

            clients[provider.name] = MistralTextProvider(
                api_key=provider.api_key,
                model=provider.model,
            )
    return clients


def initialize_text_router() -> LLMTextRouter:
    global _TEXT_ROUTER
    providers = _build_provider_configs()
    _TEXT_ROUTER = LLMTextRouter(
        providers=providers,
        provider_clients=_build_provider_clients(providers),
    )
    logger.info("Initialized text router with %s providers", len(providers))
    return _TEXT_ROUTER


def get_text_router() -> LLMTextRouter:
    global _TEXT_ROUTER
    if _TEXT_ROUTER is None:
        _TEXT_ROUTER = initialize_text_router()
    return _TEXT_ROUTER


async def generate_text_reply(
    prompt: str,
    *,
    task: str = "interactive",
    system_instruction: str | None = None,
    temperature: float | None = None,
    max_output_tokens: int | None = None,
) -> str:
    return await get_text_router().generate_text(
        prompt,
        task=task,
        system_instruction=system_instruction,
        temperature=temperature,
        max_output_tokens=max_output_tokens,
    )
