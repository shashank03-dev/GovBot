import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from jose import jwt

from gov_agent import ssp_router
from gov_agent.config import SECRET_KEY


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

    def upsert(self, payload, **_kwargs):
        self._mode = "upsert"
        self._upsert_payload = payload
        return self

    def update(self, payload):
        self._mode = "update"
        self._update_payload = payload
        return self

    def eq(self, field, value):
        self._filters.append((field, value))
        return self

    def order(self, field, desc=False):
        self._order_field = field
        self._order_desc = desc
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
            payload = dict(self._update_payload)
            updated = []
            for index, row in enumerate(rows):
                if all(row.get(field) == value for field, value in self._filters):
                    rows[index] = {**row, **payload}
                    updated.append(rows[index])
            return _FakeResult(updated)

        if self._order_field:
            filtered = sorted(
                filtered,
                key=lambda row: str(row.get(self._order_field) or ""),
                reverse=self._order_desc,
            )
        if self._limit is not None:
            filtered = filtered[: self._limit]
        return _FakeResult(filtered)


class _FakeSupabase:
    def __init__(self):
        self.storage: dict[str, list[dict]] = {
            "sessions": [],
            "applications": [],
        }

    def table(self, name: str):
        return _FakeTable(self.storage, name)


def _build_client() -> TestClient:
    app = FastAPI()
    app.include_router(ssp_router.router, prefix="/api")
    return TestClient(app)


def _auth_headers(phone: str) -> dict[str, str]:
    token = jwt.encode({"phone": phone, "sub": phone}, str(SECRET_KEY), algorithm="HS256")
    return {"Authorization": f"Bearer {token}"}


class SSPRouterTests(unittest.TestCase):
    def test_get_ssp_draft_requires_authentication(self):
        client = _build_client()

        response = client.get("/api/ssp/draft/919999999999")

        self.assertEqual(response.status_code, 401)

    def test_get_ssp_draft_returns_saved_session_data(self):
        fake_supabase = _FakeSupabase()
        fake_supabase.storage["sessions"].append(
            {
                "phone": "919999999999",
                "state": "ssp_web_draft",
                "collected_data": {
                    "portal_drafts": {
                        "ssp": {
                            "current_step": "step-2",
                            "language": "en",
                            "fields": {"student_name": "Test User"},
                        }
                    }
                },
            }
        )
        client = _build_client()

        with patch.object(ssp_router, "supabase", fake_supabase):
            response = client.get("/api/ssp/draft/919999999999", headers=_auth_headers("919999999999"))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["draft"]["fields"]["student_name"], "Test User")

    def test_sync_profile_persists_profile_and_review_fields_into_ssp_draft(self):
        fake_supabase = _FakeSupabase()
        fake_supabase.storage["sessions"].append(
            {
                "phone": "919999999999",
                "state": "ssp_web_draft",
                "collected_data": {
                    "portal_drafts": {
                        "ssp": {
                            "current_step": "step-2",
                            "language": "en",
                            "fields": {
                                "hostel_name": "Legacy Hostel",
                                "student_name": "Old Draft Name",
                            },
                        }
                    }
                },
            }
        )
        fake_supabase.storage["citizen_profiles"] = [
            {
                "phone": "919999999999",
                "full_name": "Synced Student",
                "father_name": "Parent Name",
                "email": "student@example.com",
                "institution": "SMVIT",
            }
        ]
        client = _build_client()

        with patch.object(ssp_router, "supabase", fake_supabase), patch.object(
            ssp_router,
            "get_latest_review_session_for_phone",
            return_value={"imported_fields": {"aadhaar_number": "123412341234"}},
        ):
            response = client.post(
                "/api/ssp/draft/919999999999/sync-profile",
                headers=_auth_headers("919999999999"),
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "synced")
        self.assertGreaterEqual(payload["updated_count"], 4)
        self.assertEqual(payload["draft"]["fields"]["student_name"], "Synced Student")
        self.assertEqual(payload["draft"]["fields"]["aadhaar_number"], "123412341234")
        self.assertEqual(payload["draft"]["fields"]["hostel_name"], "Legacy Hostel")

    def test_submit_ssp_creates_application_when_required_fields_exist(self):
        fake_supabase = _FakeSupabase()
        client = _build_client()

        with patch.object(ssp_router, "supabase", fake_supabase):
            response = client.post(
                "/api/ssp/draft/919999999999/submit",
                headers=_auth_headers("919999999999"),
                json={
                    "current_step": "step-5",
                    "language": "en",
                    "fields": {
                        "student_name": "Test User",
                        "dob": "30-10-2006",
                        "aadhaar_number": "123412341234",
                        "college_name": "SMVIT",
                        "course_name": "BE",
                        "final_declaration_accepted": True,
                    },
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["status"], "success")
        self.assertTrue(payload["confirmation_number"].startswith("SSP2026"))
        self.assertEqual(fake_supabase.storage["applications"][0]["portal"], "ssp")

    def test_submit_ssp_updates_existing_application_for_same_phone_and_portal(self):
        fake_supabase = _FakeSupabase()
        fake_supabase.storage["applications"].append(
            {
                "id": "app-existing",
                "phone": "919999999999",
                "confirmation_number": "SSP2026EXISTING",
                "service": "SSP Scholarship",
                "status": "submitted",
                "portal": "ssp",
                "timeline_steps": [],
                "submitted_at": "2026-05-27T12:00:00+00:00",
            }
        )
        client = _build_client()

        with patch.object(ssp_router, "supabase", fake_supabase):
            response = client.post(
                "/api/ssp/draft/919999999999/submit",
                headers=_auth_headers("919999999999"),
                json={
                    "current_step": "step-5",
                    "language": "en",
                    "fields": {
                        "student_name": "Updated User",
                        "dob": "30-10-2006",
                        "aadhaar_number": "123412341234",
                        "college_name": "SMVIT",
                        "course_name": "BE",
                        "final_declaration_accepted": True,
                    },
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["confirmation_number"], "SSP2026EXISTING")
        self.assertEqual(len(fake_supabase.storage["applications"]), 1)
        self.assertEqual(fake_supabase.storage["applications"][0]["confirmation_number"], "SSP2026EXISTING")
        self.assertEqual(fake_supabase.storage["applications"][0]["status"], "submitted")


if __name__ == "__main__":
    unittest.main()
