import types
import unittest
from unittest.mock import patch

from gov_agent import gemini_client


class GeminiClientFallbackTests(unittest.TestCase):
    def test_generate_text_falls_back_to_next_model_when_first_model_fails(self):
        calls = []

        class _FakeModels:
            def generate_content(self, *, model, contents, config=None):
                calls.append(model)
                if model == "gemini-2.5-flash":
                    raise RuntimeError("quota exhausted")
                return types.SimpleNamespace(text="fallback response")

        fake_client = types.SimpleNamespace(models=_FakeModels())

        with (
            patch.object(gemini_client, "get_gemini_client", return_value=fake_client),
            patch.object(gemini_client, "GEMINI_GENERATION_MODELS", ""),
            patch.object(
                gemini_client,
                "GENERATION_MODEL_FALLBACKS",
                ("gemini-2.0-flash",),
                create=True,
            ),
        ):
            text = gemini_client.generate_text("hello", model="gemini-2.5-flash")

        self.assertEqual(text, "fallback response")
        self.assertEqual(calls, ["gemini-2.5-flash", "gemini-2.0-flash"])


if __name__ == "__main__":
    unittest.main()
