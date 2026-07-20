import re
import unittest
from pathlib import Path

from gov_agent import profile_router


REPO_ROOT = Path(__file__).resolve().parents[1]
PROFILE_SYNC_JS = REPO_ROOT / "frontend" / "lib" / "profileSync.mjs"

# Every field the NSP autofill needs, as mapped in frontend/lib/formFillTargets.mjs.
NSP_REQUIRED_PROFILE_FIELDS = {
    "full_name",
    "dob",
    "gender",
    "aadhaar_number",
    "caste",
    "religion",
    "email",
    "income",
    "state",
    "district",
    "institution",
    "course_name",
    "academic_year",
    "board",
    "admission_date",
    "marks_pct",
    "bank_name",
    "bank_account",
    "bank_ifsc",
    "bank_branch",
}


def _parse_js_profile_weights() -> dict[str, int]:
    """Read PROFILE_FIELD_WEIGHTS out of the frontend mirror of _PROFILE_FIELDS."""
    source = PROFILE_SYNC_JS.read_text(encoding="utf-8")
    block = re.search(r"const PROFILE_FIELD_WEIGHTS = \{(.*?)\};", source, re.S)
    assert block, "PROFILE_FIELD_WEIGHTS block not found in profileSync.mjs"
    return {
        name: int(weight)
        for name, weight in re.findall(r"^\s*(\w+):\s*(\d+),", block.group(1), re.M)
    }


class AadhaarDerivationTests(unittest.TestCase):
    def test_last4_ignores_spaces_and_separators(self):
        self.assertEqual(profile_router._aadhaar_last4("9999 0000 1234"), "1234")
        self.assertEqual(profile_router._aadhaar_last4("9999-0000-1234"), "1234")
        self.assertEqual(profile_router._aadhaar_last4("999900001234"), "1234")

    def test_short_input_returns_what_is_available(self):
        self.assertEqual(profile_router._aadhaar_last4("12"), "12")
        self.assertEqual(profile_router._aadhaar_last4(""), "")


class ProfileCompletenessTests(unittest.TestCase):
    def test_profile_with_every_nsp_field_scores_100_percent(self):
        profile = {field: "filled" for field in profile_router._PROFILE_FIELDS}
        pct, missing = profile_router._compute_completeness(profile)

        self.assertEqual(pct, 100)
        self.assertEqual(missing, [])

    def test_every_field_the_nsp_autofill_needs_is_scored(self):
        unscored = NSP_REQUIRED_PROFILE_FIELDS - set(profile_router._PROFILE_FIELDS)

        self.assertEqual(unscored, set(), f"NSP fields missing from completeness: {unscored}")

    def test_derived_aadhaar_last4_is_not_double_counted(self):
        self.assertNotIn("aadhaar_last4", profile_router._PROFILE_FIELDS)
        self.assertIn("aadhaar_number", profile_router._PROFILE_FIELDS)

    def test_frontend_weight_mirror_matches_backend(self):
        self.assertEqual(_parse_js_profile_weights(), profile_router._PROFILE_FIELDS)


if __name__ == "__main__":
    unittest.main()
