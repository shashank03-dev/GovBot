import unittest
import json
import os
import subprocess
import sys

from gov_agent import main


class MainRouteTests(unittest.TestCase):
    def test_whatsapp_webhook_is_available_on_legacy_and_namespaced_paths(self):
        paths = {route.path for route in main.app.routes}

        self.assertIn("/govbot/webhook", paths)
        self.assertIn("/webhook", paths)

    def test_main_import_defers_heavy_runtime_modules(self):
        env = os.environ.copy()
        env["PYTHONPATH"] = os.getcwd()
        code = """
import json
import sys

import gov_agent.main

print(json.dumps({
    name: name in sys.modules
    for name in (
        "gov_agent.rag_engine",
        "gov_agent.graph",
        "web3",
        "supabase",
        "google.genai",
        "langgraph",
        "pytesseract",
        "pdfplumber",
    )
}))
"""

        result = subprocess.run(
            [sys.executable, "-c", code],
            check=True,
            cwd=os.getcwd(),
            env=env,
            capture_output=True,
            text=True,
        )

        loaded_modules = json.loads(result.stdout)
        self.assertEqual(
            loaded_modules,
            {
                "gov_agent.rag_engine": False,
                "gov_agent.graph": False,
                "web3": False,
                "supabase": False,
                "google.genai": False,
                "langgraph": False,
                "pytesseract": False,
                "pdfplumber": False,
            },
        )


if __name__ == "__main__":
    unittest.main()
