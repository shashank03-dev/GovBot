import inspect
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from gov_agent import analytics_router
from gov_agent.official_auth import require_official_auth

TABLES = {
    "applications": [
        {"phone": "1", "portal": "nsp", "status": "approved", "submitted_at": "2026-01-02T00:00:00+00:00"},
        {"phone": "2", "portal": "nsp", "status": "submitted", "submitted_at": "2026-01-03T00:00:00+00:00"},
    ],
    "verifiable_credentials": [{"id": 1}, {"id": 2}, {"id": 3}],
    "disbursement_tracking": [
        {"status": "credited", "amount": 500},
        {"status": "credited", "amount": 250},
        {"status": "pending", "amount": 100},
    ],
    "bank_verifications": [{"verified": True}, {"verified": False}],
    "fraud_flags": [{"aadhaar_hash": "a", "flagged_at": "2026-01-01T00:00:00+00:00"}],
    "sessions": [],
}


class FakeQuery:
    def __init__(self, table, log):
        self.table, self.log = table, log
        self.filters, self.count, self.head = [], None, False

    def select(self, *_columns, count=None, head=None):
        self.count, self.head = count, bool(head)
        return self

    def eq(self, column, value):
        self.filters.append(lambda row: row.get(column) == value)
        return self

    def gte(self, column, value):
        self.filters.append(lambda row: str(row.get(column) or "") >= value)
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, _n):
        return self

    def execute(self):
        rows = [row for row in TABLES[self.table] if all(f(row) for f in self.filters)]
        self.log.append((self.table, self.count, self.head))
        return SimpleNamespace(
            data=[] if self.head else rows,
            count=len(rows) if self.count else None,
        )


class FakeSupabase:
    def __init__(self):
        self.log = []

    def table(self, name):
        return FakeQuery(name, self.log)


def _client(fake):
    app = FastAPI()
    app.include_router(analytics_router.router, prefix="/api")
    app.dependency_overrides[require_official_auth] = lambda: {"sub": "test"}
    return TestClient(app)


class AnalyticsRouterTests(unittest.TestCase):
    def test_handlers_run_in_threadpool(self):
        for route in analytics_router.router.routes:
            self.assertFalse(
                inspect.iscoroutinefunction(route.endpoint),
                f"{route.path} must be sync so blocking Supabase calls stay off the event loop",
            )

    def test_overview_aggregates_and_counts_without_rows(self):
        fake = FakeSupabase()
        with patch.object(analytics_router, "supabase", fake):
            response = _client(fake).get("/api/analytics/overview")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["total_applications"], 2)
        self.assertEqual(body["status_breakdown"]["approved"], 1)
        self.assertEqual(body["total_credentials_issued"], 3)
        self.assertEqual(body["total_disbursed_inr"], 750)
        self.assertEqual(body["verified_bank_accounts"], 1)
        self.assertEqual(body["fraud_flags"], 1)
        for table, count, head in fake.log:
            if count:
                self.assertTrue(head, f"count on {table} should be a HEAD request")

    def test_realtime_and_disbursements(self):
        fake = FakeSupabase()
        with patch.object(analytics_router, "supabase", fake):
            client = _client(fake)
            realtime = client.get("/api/analytics/realtime").json()
            disbursements = client.get("/api/analytics/disbursements/summary").json()

        self.assertEqual(realtime["pending_disbursements"], 1)
        self.assertEqual(realtime["active_sessions"], 0)
        self.assertEqual(
            disbursements["status_counts"],
            {"pending": 1, "processing": 0, "credited": 2, "failed": 0},
        )
        self.assertEqual(disbursements["pending_amount_inr"], 100)
        self.assertEqual(disbursements["credited_amount_inr"], 750)


if __name__ == "__main__":
    unittest.main()
