import unittest
from unittest.mock import patch

from gov_agent import form_scanner_router


class FormScannerHeuristicTests(unittest.TestCase):
    def test_heuristic_maps_common_address_fields(self):
        fields = [
            {"label": "Street address", "name": "address1", "id": "", "placeholder": ""},
            {"label": "City", "name": "city", "id": "", "placeholder": ""},
            {"label": "State / Province", "name": "state", "id": "", "placeholder": ""},
            {"label": "ZIP / Postal code", "name": "zip", "id": "", "placeholder": ""},
            {"label": "Email", "name": "email", "id": "", "placeholder": ""},
        ]

        result = form_scanner_router._heuristic_map_fields(fields)

        self.assertEqual(result["address1"], "address")
        self.assertEqual(result["city"], "district")
        self.assertEqual(result["state"], "state")
        self.assertEqual(result["zip"], "pincode")
        self.assertEqual(result["email"], "email")

    def test_find_fallback_chromium_executable_uses_downloaded_browser_when_present(self):
        with (
            patch.object(form_scanner_router, "glob", autospec=True) as glob_mock,
            patch.object(form_scanner_router.os.path, "isfile", return_value=True),
        ):
            glob_mock.glob.return_value = ["/home/user/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome"]

            result = form_scanner_router._find_fallback_chromium_executable()

        self.assertEqual(result, "/home/user/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome")
