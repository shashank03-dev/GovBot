import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from gov_agent import live_router


class LiveDashboardSnapshotTests(unittest.IsolatedAsyncioTestCase):
    async def test_get_dashboard_snapshot_returns_real_counts_and_activity(self):
        applications_chain = MagicMock()
        applications_query = applications_chain.select.return_value
        applications_query.eq.return_value.order.return_value.execute.return_value.data = [
            {
                "id": "app-2",
                "service": "SSP Scholarship",
                "status": "pending",
                "confirmation_number": None,
                "submitted_at": "2026-05-21T13:30:00+00:00",
            },
            {
                "id": "app-1",
                "service": "NSP Scholarship",
                "status": "submitted",
                "confirmation_number": "NSP2026ABC123",
                "submitted_at": "2026-05-21T12:00:00+00:00",
            },
        ]

        activity_chain = MagicMock()
        activity_query = activity_chain.select.return_value
        activity_query.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = [
            {"event": "Bank verified", "created_at": "2026-05-21T12:05:00+00:00"},
            {"event": "Application submitted", "created_at": "2026-05-21T12:00:00+00:00"},
        ]

        supabase_mock = MagicMock()
        supabase_mock.table.side_effect = [applications_chain, activity_chain]

        with patch.object(live_router, "supabase", supabase_mock):
            snapshot = await live_router.get_dashboard_snapshot("919876543210", token_phone="919876543210")

        self.assertEqual(snapshot["summary"], {"total": 2, "submitted": 1, "pending": 1, "failed": 0})
        self.assertEqual([app["id"] for app in snapshot["applications"]], ["app-2", "app-1"])
        self.assertEqual(
            snapshot["activities"],
            [
                {"event": "Application submitted", "timestamp": "2026-05-21T12:00:00+00:00"},
                {"event": "Bank verified", "timestamp": "2026-05-21T12:05:00+00:00"},
            ],
        )

    async def test_get_dashboard_snapshot_rejects_mismatched_token(self):
        with self.assertRaises(HTTPException) as ctx:
            await live_router.get_dashboard_snapshot("919876543210", token_phone="911234567890")

        self.assertEqual(ctx.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
