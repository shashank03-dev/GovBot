import unittest
import json
import os
import subprocess
import sys

from gov_agent import main


class MainRouteTests(unittest.TestCase):
    def test_whatsapp_webhook_is_available_on_legacy_and_namespaced_paths(self):
        # Probe the routes over HTTP: FastAPI 0.16x wraps included routers, and the
        # legacy /webhook alias is hidden from the OpenAPI schema on purpose. Run it in
        # a subprocess so starting the app doesn't freeze middleware for other tests.
        env = os.environ.copy()
        env["PYTHONPATH"] = os.getcwd()
        code = """
import json
from fastapi.testclient import TestClient
import gov_agent.main as main

client = TestClient(main.app)
params = {"hub.mode": "subscribe", "hub.verify_token": "wrong-token", "hub.challenge": "1"}
print(json.dumps({path: client.get(path, params=params).status_code for path in ("/govbot/webhook", "/webhook")}))
"""
        result = subprocess.run(
            [sys.executable, "-c", code],
            check=True,
            cwd=os.getcwd(),
            env=env,
            capture_output=True,
            text=True,
        )
        # 403 = route exists and rejected the wrong verify token (404 would mean missing).
        self.assertEqual(json.loads(result.stdout.strip().splitlines()[-1]), {"/govbot/webhook": 403, "/webhook": 403})

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
