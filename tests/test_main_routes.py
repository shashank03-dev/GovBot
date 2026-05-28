import unittest

from gov_agent import main


class MainRouteTests(unittest.TestCase):
    def test_whatsapp_webhook_is_available_on_legacy_and_namespaced_paths(self):
        paths = {route.path for route in main.app.routes}

        self.assertIn("/govbot/webhook", paths)
        self.assertIn("/webhook", paths)


if __name__ == "__main__":
    unittest.main()
