import types
import unittest
from unittest.mock import patch

from gov_agent import gemini_client
from gov_agent.gemini_client import GeminiPool, GeminiRateLimitError


class _Clock:
    def __init__(self, now: float = 1_800_000_000.0):
        self.now = now

    def __call__(self) -> float:
        return self.now


def _pool(keys, behaviour, *, limits=None, clock=None):
    """Build a pool whose fake clients call behaviour(key, model)."""
    calls = []

    def _factory(api_key):
        class _Models:
            def generate_content(self, *, model, contents, config=None):
                calls.append((api_key, model))
                return types.SimpleNamespace(text=behaviour(api_key, model))

        return types.SimpleNamespace(models=_Models())

    pool = GeminiPool(
        keys,
        rate_limits=limits if limits is not None else {},
        client_factory=_factory,
        clock=clock or _Clock(),
    )
    return pool, calls


def _generate(pool, **kwargs):
    with patch.object(gemini_client, "get_gemini_pool", return_value=pool):
        return gemini_client.generate_text("hello", **kwargs)


class GeminiPoolTests(unittest.TestCase):
    def setUp(self):
        patcher = patch.object(gemini_client, "GEMINI_GENERATION_MODELS", "model-a,model-b")
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_rate_limited_key_rotates_to_second_key_on_same_model(self):
        def behaviour(key, model):
            if key == "key-1":
                raise RuntimeError("429 RESOURCE_EXHAUSTED retryDelay: '30s'")
            return f"{key}:{model}"

        pool, calls = _pool(["key-1", "key-2"], behaviour)
        self.assertEqual(_generate(pool), "key-2:model-a")
        self.assertEqual(calls, [("key-1", "model-a"), ("key-2", "model-a")])

    def test_falls_back_to_next_model_when_every_key_is_limited(self):
        def behaviour(key, model):
            if model == "model-a":
                raise RuntimeError("429 RESOURCE_EXHAUSTED")
            return f"{key}:{model}"

        pool, calls = _pool(["key-1", "key-2"], behaviour)
        self.assertTrue(_generate(pool).endswith(":model-b"))
        self.assertEqual([model for _, model in calls], ["model-a", "model-a", "model-b"])

    def test_cooldown_skips_limited_slot_until_retry_delay_passes(self):
        clock = _Clock()
        limited = {"on": True}

        def behaviour(key, model):
            if limited["on"] and model == "model-a":
                raise RuntimeError("429 RESOURCE_EXHAUSTED retryDelay: '30s'")
            return model

        pool, calls = _pool(["key-1"], behaviour, clock=clock)
        self.assertEqual(_generate(pool), "model-b")
        limited["on"] = False

        clock.now += 10
        calls.clear()
        self.assertEqual(_generate(pool), "model-b")
        self.assertEqual(calls, [("key-1", "model-b")])

        clock.now += 25
        self.assertEqual(_generate(pool), "model-a")

    def test_per_day_quota_cools_down_until_pacific_midnight(self):
        clock = _Clock()

        def behaviour(key, model):
            raise RuntimeError("429 RESOURCE_EXHAUSTED GenerateRequestsPerDayPerProjectPerModel-FreeTier")

        pool, _ = _pool(["key-1"], behaviour, clock=clock)
        with self.assertRaises(GeminiRateLimitError):
            _generate(pool)
        slot = pool._slots[(0, "model-a")]
        self.assertGreater(slot.cooldown_until - clock.now, 60)
        self.assertLessEqual(slot.cooldown_until - clock.now, 24 * 3600)

    def test_rpm_budget_is_enforced_client_side_without_calling_google(self):
        clock = _Clock()
        pool, calls = _pool(
            ["key-1"],
            lambda key, model: model,
            limits={"model-a": (2, 100), "model-b": (1, 100)},
            clock=clock,
        )
        results = [_generate(pool) for _ in range(3)]
        self.assertEqual(results, ["model-a", "model-a", "model-b"])
        with self.assertRaises(GeminiRateLimitError):
            _generate(pool)
        self.assertEqual(len(calls), 3)

        clock.now += 61
        self.assertEqual(_generate(pool), "model-a")

    def test_rpd_budget_blocks_until_next_day(self):
        clock = _Clock()
        pool, _ = _pool(
            ["key-1"],
            lambda key, model: model,
            limits={"model-a": (100, 1), "model-b": (100, 1)},
            clock=clock,
        )
        _generate(pool)
        _generate(pool)
        clock.now += 3600
        with self.assertRaises(GeminiRateLimitError):
            _generate(pool)
        clock.now += 24 * 3600
        self.assertEqual(_generate(pool), "model-a")

    def test_invalid_image_error_is_not_retried_on_other_slots(self):
        def behaviour(key, model):
            raise RuntimeError("400 INVALID_ARGUMENT Unable to process input image")

        pool, calls = _pool(["key-1", "key-2"], behaviour)
        with self.assertRaises(RuntimeError) as ctx:
            _generate(pool)
        self.assertNotIsInstance(ctx.exception, GeminiRateLimitError)
        self.assertEqual(len(calls), 1)

    def test_server_error_moves_to_next_slot_and_reraises_when_all_fail(self):
        def behaviour(key, model):
            raise RuntimeError("503 UNAVAILABLE overloaded")

        pool, calls = _pool(["key-1"], behaviour)
        with self.assertRaises(RuntimeError) as ctx:
            _generate(pool)
        self.assertIn("UNAVAILABLE", str(ctx.exception))
        self.assertEqual(len(calls), 2)

    def test_requested_model_is_tried_before_configured_models(self):
        pool, calls = _pool(["key-1"], lambda key, model: model)
        self.assertEqual(_generate(pool, model="model-b"), "model-b")
        self.assertEqual(calls, [("key-1", "model-b")])

    def test_starting_key_rotates_to_spread_load(self):
        pool, calls = _pool(["key-1", "key-2"], lambda key, model: key)
        self.assertEqual([_generate(pool) for _ in range(4)], ["key-1", "key-2", "key-1", "key-2"])

    def test_rate_limit_error_is_classified_as_rate_limited_for_router(self):
        from gov_agent.providers.base import classify_provider_error

        error = classify_provider_error(GeminiRateLimitError("all slots busy"))
        self.assertEqual(error.kind, "rate_limited")

    def test_no_keys_raises_clear_error(self):
        pool, _ = _pool([], lambda key, model: model)
        with self.assertRaisesRegex(RuntimeError, "GEMINI_API_KEY"):
            _generate(pool)


class GeminiConfigParsingTests(unittest.TestCase):
    def test_rate_limit_override_parsing(self):
        limits = gemini_client._parse_rate_limits("custom=7/70, bad-entry ,gemini-2.5-flash-lite=20/2000")
        self.assertEqual(limits["custom"], (7, 70))
        self.assertEqual(limits["gemini-2.5-flash-lite"], (20, 2000))
        self.assertIn("gemini-3.5-flash-lite", limits)

    def test_default_models_avoid_retired_generations(self):
        with patch.object(gemini_client, "GEMINI_GENERATION_MODELS", ""):
            models = gemini_client.configured_generation_models()
        self.assertEqual(models, list(gemini_client.DEFAULT_GENERATION_MODELS))
        for retired in ("gemini-2.0-flash", "gemini-2.5-flash"):
            self.assertNotIn(retired, models)


if __name__ == "__main__":
    unittest.main()
