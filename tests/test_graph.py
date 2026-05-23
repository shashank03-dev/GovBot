import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from gov_agent.graph import verify_eligibility


class GraphEligibilityTests(unittest.IsolatedAsyncioTestCase):
    async def test_verify_eligibility_accepts_iso_dob_format(self):
        state = {
            "name": "Test User",
            "dob": "2006-10-30",
            "income": 25000,
            "aadhaar_number": "663408355424",
            "phone": "919999999999",
            "media_id": "media-1",
            "portal": "nsp",
            "doc_path": "",
            "eligible": False,
            "missing_fields": [],
            "submission_result": {},
            "error": "",
        }

        result = await verify_eligibility(state)

        self.assertTrue(result["eligible"])
        self.assertEqual(result["error"], "")


if __name__ == "__main__":
    unittest.main()
