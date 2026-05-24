import unittest
from unittest.mock import patch

from gov_agent import rag_engine


class RagEngineTests(unittest.IsolatedAsyncioTestCase):
    async def test_query_eligibility_falls_back_when_generation_fails(self):
        with (
            patch.object(rag_engine, "embed_text", return_value=[0.1, 0.2, 0.3]),
            patch.object(
                rag_engine.collection,
                "query",
                return_value={"documents": [["Income limit: 250000", "Documents: Aadhaar, income certificate"]]},
            ),
            patch.object(rag_engine, "generate_text", side_effect=RuntimeError("quota exceeded")),
        ):
            result = await rag_engine.query_eligibility("Am I eligible?")

        self.assertIn("temporarily unavailable", result)
        self.assertIn("Income limit", result)


if __name__ == "__main__":
    unittest.main()
