import types
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from gov_agent import digilocker_router


class _FakeResult:
    def __init__(self, data):
        self.data = data


class _FakeTable:
    def __init__(self, db, name: str):
        self.db = db
        self.name = name
        self._filters: list[tuple[str, object]] = []
        self._limit: int | None = None
        self._insert_payload = None
        self._upsert_payload = None
        self._update_payload = None
        self._mode = "select"

    def select(self, *_args, **_kwargs):
        self._mode = "select"
        return self

    def insert(self, payload):
        self._mode = "insert"
        self._insert_payload = payload
        return self

    def update(self, payload):
        self._mode = "update"
        self._update_payload = payload
        return self

    def upsert(self, payload, **_kwargs):
        self._mode = "upsert"
        self._upsert_payload = payload
        return self

    def delete(self):
        self._mode = "delete"
        return self

    def eq(self, field, value):
        self._filters.append((field, value))
        return self

    def limit(self, value):
        self._limit = value
        return self

    def execute(self):
        rows = self.db.setdefault(self.name, [])
        filtered = [row for row in rows if all(row.get(field) == value for field, value in self._filters)]

        if self._mode == "insert":
            payload = dict(self._insert_payload)
            rows.append(payload)
            return _FakeResult([payload])

        if self._mode == "upsert":
            payload = dict(self._upsert_payload)
            phone = payload.get("phone")
            for index, row in enumerate(rows):
                if row.get("phone") == phone:
                    rows[index] = {**row, **payload}
                    return _FakeResult([rows[index]])
            rows.append(payload)
            return _FakeResult([payload])

        if self._mode == "update":
            for row in filtered:
                row.update(self._update_payload)
            return _FakeResult(filtered)

        if self._mode == "delete":
            self.db[self.name] = [row for row in rows if row not in filtered]
            return _FakeResult(filtered)

        if self._limit is not None:
            filtered = filtered[: self._limit]
        return _FakeResult(filtered)


class _FakeSupabase:
    def __init__(self):
        self.storage: dict[str, list[dict]] = {
            "sessions": [],
            "digilocker_consents": [],
            "digilocker_docs": [],
            "citizen_profiles": [],
        }

    def table(self, name: str):
        return _FakeTable(self.storage, name)


def _build_client() -> TestClient:
    app = FastAPI()
    app.include_router(digilocker_router.router)
    return TestClient(app)


class DigiLockerRouterTests(unittest.IsolatedAsyncioTestCase):
    async def test_create_mock_consent_stores_portal_aware_scope_and_context(self):
        fake_supabase = _FakeSupabase()
        fake_supabase.storage["sessions"].append({"phone": "919999999999", "state": "greeting", "collected_data": {}})

        with patch.object(digilocker_router, "supabase", fake_supabase):
            consent = await digilocker_router.create_mock_consent(
                digilocker_router.CreateConsentRequest(
                    phone="919999999999",
                    portal="nsp",
                    channel="web",
                    return_to="/nsp/apply",
                    selected_optional_docs=["marksheet"],
                )
            )

        stored = fake_supabase.storage["digilocker_consents"][0]
        self.assertEqual(stored["phone"], "919999999999")
        self.assertEqual(stored["scope"], ["aadhaar", "income_certificate", "marksheet"])
        self.assertEqual(consent.status, "pending")
        self.assertIn("/digilocker/callback?consent_id=", consent.redirect_url)
        session_context = fake_supabase.storage["sessions"][0]["collected_data"]["digilocker_context_by_consent"][consent.consent_id]
        self.assertEqual(session_context["portal"], "nsp")
        self.assertEqual(session_context["channel"], "web")
        self.assertEqual(session_context["return_to"], "/nsp/apply")

    async def test_mock_callback_returns_review_session_and_only_selected_documents(self):
        fake_supabase = _FakeSupabase()
        fake_supabase.storage["sessions"].append({"phone": "919999999999", "state": "greeting", "collected_data": {}})
        fake_supabase.storage["digilocker_consents"].append(
            {
                "consent_id": "mock-consent-123",
                "phone": "919999999999",
                "status": "pending",
                "scope": ["aadhaar", "income_certificate"],
            }
        )
        fake_supabase.storage["sessions"][0]["collected_data"] = {
            "digilocker_context_by_consent": {
                "mock-consent-123": {"portal": "nsp", "channel": "web", "return_to": "/nsp/apply"}
            }
        }

        with patch.object(digilocker_router, "supabase", fake_supabase), patch.object(
            digilocker_router,
            "ingest_document",
            new=AsyncMock(return_value={"status": "ready"}),
        ):
            result = await digilocker_router.mock_callback("mock-consent-123")

        self.assertEqual(result["status"], "success")
        self.assertEqual(result["documents_fetched"], 2)
        self.assertIn("review_session_id", result)
        self.assertIn("review_url", result)
        stored_doc_types = [row["doc_type"] for row in fake_supabase.storage["digilocker_docs"]]
        self.assertEqual(stored_doc_types, ["aadhaar", "income_certificate"])

    async def test_review_and_decision_endpoints_round_trip(self):
        fake_supabase = _FakeSupabase()
        fake_supabase.storage["sessions"].append({"phone": "919999999999", "state": "greeting", "collected_data": {}})
        fake_supabase.storage["digilocker_consents"].append(
            {
                "consent_id": "mock-consent-456",
                "phone": "919999999999",
                "status": "pending",
                "scope": ["aadhaar", "income_certificate", "marksheet"],
            }
        )
        fake_supabase.storage["sessions"][0]["collected_data"] = {
            "digilocker_context_by_consent": {
                "mock-consent-456": {"portal": "nsp", "channel": "web", "return_to": "/nsp/apply"}
            }
        }

        with patch.object(digilocker_router, "supabase", fake_supabase), patch.object(
            digilocker_router,
            "ingest_document",
            new=AsyncMock(return_value={"status": "ready"}),
        ):
            callback_result = await digilocker_router.mock_callback("mock-consent-456")

        review_session_id = callback_result["review_session_id"]
        client = _build_client()

        with patch.object(digilocker_router, "supabase", fake_supabase):
            review_response = client.get(
                f"/digilocker/review/{review_session_id}",
                params={"phone": "919999999999"},
            )
            decision_response = client.post(
                f"/digilocker/review/{review_session_id}/decision",
                json={"phone": "919999999999", "decision": "use"},
            )

        self.assertEqual(review_response.status_code, 200)
        self.assertEqual(review_response.json()["portal"], "nsp")
        self.assertEqual(decision_response.status_code, 200)
        self.assertEqual(decision_response.json()["decision"], "use")
        self.assertIn("/nsp/apply?review_session=", decision_response.json()["next_url"])


if __name__ == "__main__":
    unittest.main()
