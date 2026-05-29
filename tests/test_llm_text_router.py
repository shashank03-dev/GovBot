import asyncio
from pathlib import Path
import types
import unittest
from unittest.mock import patch

from gov_agent.llm_text_router import LLMTextRouter
from gov_agent.providers.gemini_provider import GeminiTextProvider
from gov_agent.providers.base import ProviderCallError, ProviderConfig


class _FakeProvider:
    def __init__(self, *, text="ok", error=None):
        self.text = text
        self.error = error
        self.calls = 0

    async def generate_text(
        self,
        prompt,
        *,
        system_instruction=None,
        temperature=None,
        max_output_tokens=None,
    ):
        self.calls += 1
        await asyncio.sleep(0)
        if self.error:
            raise self.error
        return self.text


class LLMTextRouterTests(unittest.IsolatedAsyncioTestCase):
    async def test_prefers_healthy_lower_latency_provider(self):
        router = LLMTextRouter(
            providers=[
                ProviderConfig(
                    name="slow",
                    provider="gemini",
                    model="gemini-2.0-flash",
                    api_key="slow-key",
                    enabled=True,
                    weight=2,
                ),
                ProviderConfig(
                    name="fast",
                    provider="groq",
                    model="llama-3.1-8b-instant",
                    api_key="fast-key",
                    enabled=True,
                    weight=2,
                ),
            ],
            provider_clients={
                "slow": _FakeProvider(text="slow"),
                "fast": _FakeProvider(text="fast"),
            },
        )

        router._provider_state["slow"].latency_ms = 900
        router._provider_state["fast"].latency_ms = 80

        result = await router.generate_text("hello")

        self.assertEqual(result, "fast")
        self.assertEqual(router._provider_state["fast"].request_count, 1)

    async def test_rate_limited_provider_goes_into_cooldown_and_fails_over(self):
        router = LLMTextRouter(
            providers=[
                ProviderConfig(
                    name="groq-1",
                    provider="groq",
                    model="llama-3.1-8b-instant",
                    api_key="groq-key",
                    enabled=True,
                    weight=3,
                ),
                ProviderConfig(
                    name="gemini-1",
                    provider="gemini",
                    model="gemini-2.0-flash",
                    api_key="gemini-key",
                    enabled=True,
                    weight=2,
                ),
            ],
            provider_clients={
                "groq-1": _FakeProvider(
                    error=ProviderCallError("rate limit", kind="rate_limited")
                ),
                "gemini-1": _FakeProvider(text="fallback"),
            },
        )

        result = await router.generate_text("hello", task="interactive")

        self.assertEqual(result, "fallback")
        self.assertGreater(router._provider_state["groq-1"].cooldown_until, 0)

    async def test_interactive_text_can_fall_back_through_three_providers(self):
        router = LLMTextRouter(
            providers=[
                ProviderConfig(
                    name="groq-1",
                    provider="groq",
                    model="llama-3.1-8b-instant",
                    api_key="groq-key",
                    enabled=True,
                    weight=3,
                ),
                ProviderConfig(
                    name="mistral-1",
                    provider="mistral",
                    model="mistral-small-latest",
                    api_key="mistral-key",
                    enabled=True,
                    weight=2,
                ),
                ProviderConfig(
                    name="gemini-1",
                    provider="gemini",
                    model="gemini-2.5-flash",
                    api_key="gemini-key",
                    enabled=True,
                    weight=1,
                ),
            ],
            provider_clients={
                "groq-1": _FakeProvider(
                    error=ProviderCallError("rate limit", kind="rate_limited")
                ),
                "mistral-1": _FakeProvider(
                    error=ProviderCallError("rate limit", kind="rate_limited")
                ),
                "gemini-1": _FakeProvider(text="gemini fallback"),
            },
        )

        result = await router.generate_text("hello", task="interactive")

        self.assertEqual(result, "gemini fallback")
        self.assertEqual(router._provider_clients["groq-1"].calls, 1)
        self.assertEqual(router._provider_clients["mistral-1"].calls, 1)
        self.assertEqual(router._provider_clients["gemini-1"].calls, 1)

    async def test_exact_match_cache_avoids_second_upstream_call(self):
        client = _FakeProvider(text="cached")
        router = LLMTextRouter(
            providers=[
                ProviderConfig(
                    name="groq-1",
                    provider="groq",
                    model="llama-3.1-8b-instant",
                    api_key="groq-key",
                    enabled=True,
                    weight=3,
                )
            ],
            provider_clients={"groq-1": client},
            cache_ttl_seconds=30,
        )

        first = await router.generate_text("repeat me")
        second = await router.generate_text("repeat me")

        self.assertEqual((first, second), ("cached", "cached"))
        self.assertEqual(client.calls, 1)

    async def test_cache_is_bounded_and_evicts_oldest_prompts(self):
        client = _FakeProvider(text="cached")
        router = LLMTextRouter(
            providers=[
                ProviderConfig(
                    name="groq-1",
                    provider="groq",
                    model="llama-3.1-8b-instant",
                    api_key="groq-key",
                    enabled=True,
                    weight=3,
                )
            ],
            provider_clients={"groq-1": client},
            cache_ttl_seconds=30,
            cache_max_entries=2,
        )

        await router.generate_text("first prompt")
        await router.generate_text("second prompt")
        await router.generate_text("third prompt")
        await router.generate_text("first prompt")

        self.assertEqual(client.calls, 4)
        self.assertLessEqual(len(router._cache), 2)


class GeminiTextProviderTests(unittest.IsolatedAsyncioTestCase):
    def test_uses_current_google_genai_sdk_not_deprecated_generativeai(self):
        source = Path("gov_agent/providers/gemini_provider.py").read_text()

        self.assertIn("from google import genai", source)
        self.assertNotIn("google.generativeai", source)

    async def test_passes_system_instruction_to_generate_content_config(self):
        recorded = {}

        class _FakeModels:
            def generate_content(self, *, model, contents, config=None):
                recorded["model_name"] = model
                recorded["prompt"] = contents
                recorded["config"] = config
                return types.SimpleNamespace(text="translated")

        class _FakeClient:
            def __init__(self, *, api_key):
                recorded["api_key"] = api_key
                self.models = _FakeModels()

        with patch(
            "gov_agent.providers.gemini_provider.genai.Client",
            new=_FakeClient,
        ):
            provider = GeminiTextProvider(api_key="gemini-key", model="gemini-2.0-flash")
            text = await provider.generate_text(
                "Hello",
                system_instruction="Translate politely",
                temperature=0.2,
                max_output_tokens=64,
            )

        self.assertEqual(text, "translated")
        self.assertEqual(recorded["api_key"], "gemini-key")
        self.assertEqual(recorded["model_name"], "gemini-2.0-flash")
        self.assertEqual(recorded["prompt"], "Hello")
        self.assertEqual(recorded["config"].system_instruction, "Translate politely")
        self.assertEqual(recorded["config"].temperature, 0.2)
        self.assertEqual(recorded["config"].max_output_tokens, 64)
