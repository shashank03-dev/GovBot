import unittest
from importlib import import_module
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from gov_agent import analytics_router, auth_router
from gov_agent import config


def _build_client() -> TestClient:
    app = FastAPI()
    app.include_router(auth_router.router, prefix="/auth")
    app.include_router(analytics_router.router, prefix="/api")

    try:
        admin_router = import_module("gov_agent.admin_router")
    except ImportError:
        admin_router = None

    if admin_router is not None:
        app.include_router(admin_router.router, prefix="/api")

    return TestClient(app)


class OfficialAuthApiTests(unittest.TestCase):
    def test_official_login_issues_token_for_shared_credentials(self):
        client = _build_client()

        with patch.object(config, "OFFICIAL_USERNAME", "district-ops"), patch.object(
            config,
            "OFFICIAL_PASSWORD",
            "let-me-in",
        ):
            response = client.post(
                "/auth/official/login",
                json={"username": "district-ops", "password": "let-me-in"},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["username"], "district-ops")
        self.assertEqual(payload["role"], "official")
        self.assertTrue(payload["token"])

    def test_analytics_overview_requires_official_token(self):
        client = _build_client()

        response = client.get("/api/analytics/overview")

        self.assertEqual(response.status_code, 401)
        self.assertIn("official", response.json()["detail"].lower())

    def test_admin_dashboard_requires_official_token(self):
        client = _build_client()

        response = client.get("/api/admin/dashboard")

        self.assertEqual(response.status_code, 401)
        self.assertIn("official", response.json()["detail"].lower())


if __name__ == "__main__":
    unittest.main()
