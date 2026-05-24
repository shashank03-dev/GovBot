import asyncio
import unittest

from gov_agent.llm_text_router import LLMTextRouter
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
