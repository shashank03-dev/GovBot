import unittest
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from gov_agent import config as config_module
from gov_agent import credentials_router


class _FakeResult:
    def __init__(self, data):
        self.data = data


class _FakeTable:
    def __init__(self, db, name: str):
        self.db = db
        self.name = name
        self._filters: list[tuple[str, object]] = []
        self._insert_payload = None
        self._order_field: str | None = None
        self._order_desc = False
        self._mode = "select"

    def select(self, *_args, **_kwargs):
        self._mode = "select"
        return self

    def insert(self, payload):
        self._mode = "insert"
        self._insert_payload = payload
        return self

    def eq(self, field, value):
        self._filters.append((field, value))
        return self

    def order(self, field, desc: bool = False):
        self._order_field = field
        self._order_desc = desc
        return self

    def execute(self):
        rows = self.db.setdefault(self.name, [])
        filtered = [row for row in rows if all(row.get(field) == value for field, value in self._filters)]

        if self._mode == "insert":
            payload = dict(self._insert_payload)
            rows.append(payload)
            return _FakeResult([payload])

        if self._order_field:
            filtered = sorted(
                filtered,
                key=lambda row: row.get(self._order_field) or "",
                reverse=self._order_desc,
            )

        return _FakeResult(filtered)


class _FakeSupabase:
    def __init__(self):
        self.storage: dict[str, list[dict]] = {"verifiable_credentials": []}

    def table(self, name: str):
        return _FakeTable(self.storage, name)


def _build_client() -> TestClient:
    app = FastAPI()
    app.include_router(credentials_router.router, prefix="/api")
    return TestClient(app)


class CredentialsRouterTests(unittest.TestCase):
    def test_get_credential_by_id_returns_record_with_network_metadata(self):
        fake_supabase = _FakeSupabase()
        fake_supabase.storage["verifiable_credentials"].append(
            {
                "credential_id": "cred-123",
                "confirmation_number": "NSP2026ABC123",
                "phone": "919999999999",
                "blockchain_tx_hash": "0xabc123",
                "credential_hash": "f" * 64,
                "ipfs_hash": None,
                "credential_json": {
                    "credentialSubject": {
                        "name": "Asha",
                        "scholarshipType": "NSP",
                        "amount": 25000,
                    }
                },
                "issued_at": "2026-05-27T10:00:00Z",
                "revoked": False,
            }
        )
        client = _build_client()

        with (
            patch.object(credentials_router, "supabase", fake_supabase),
            patch.object(config_module, "CREDENTIAL_CHAIN_NAME", "Polygon Amoy"),
            patch.object(config_module, "CREDENTIAL_EXPLORER_BASE_URL", "https://amoy.polygonscan.com/tx/"),
        ):
            response = client.get("/api/credentials/id/cred-123")

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["credential_id"], "cred-123")
        self.assertEqual(payload["network_name"], "Polygon Amoy")
        self.assertEqual(payload["explorer_url"], "https://amoy.polygonscan.com/tx/0xabc123")

    def test_issue_credential_uses_configured_explorer_base_url(self):
        client = _build_client()
        fake_supabase = _FakeSupabase()

        with (
            patch.object(credentials_router, "supabase", fake_supabase),
            patch.object(credentials_router, "WEB3_AVAILABLE", False),
            patch.object(credentials_router, "_upload_to_ipfs", new=AsyncMock(return_value=None)),
            patch.object(config_module, "CREDENTIAL_CHAIN_NAME", "Polygon Amoy"),
            patch.object(config_module, "CREDENTIAL_EXPLORER_BASE_URL", "https://amoy.polygonscan.com/tx/"),
        ):
            response = client.post(
                "/api/credentials/issue",
                json={
                    "confirmation_number": "NSP2026ZXCV",
                    "phone": "919999999999",
                    "student_name": "Asha",
                    "scholarship_type": "NSP",
                    "amount": 25000,
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["network_name"], "Polygon Amoy")
        self.assertEqual(
            payload["explorer_url"],
            f"https://amoy.polygonscan.com/tx/{payload['blockchain_tx_hash']}",
        )
        self.assertEqual(payload["polygonscan_url"], payload["explorer_url"])


if __name__ == "__main__":
    unittest.main()
