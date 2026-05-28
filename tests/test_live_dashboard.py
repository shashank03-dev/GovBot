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
                "portal": "ssp",
                "submitted_at": "2026-05-21T13:30:00+00:00",
            },
            {
                "id": "app-1",
                "service": "NSP Scholarship",
                "status": "submitted",
                "confirmation_number": "NSP2026ABC123",
                "portal": "nsp",
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

    async def test_get_dashboard_snapshot_hides_older_duplicate_applications(self):
        applications_chain = MagicMock()
        applications_query = applications_chain.select.return_value
        applications_query.eq.return_value.order.return_value.execute.return_value.data = [
            {
                "id": "app-new",
                "phone": "919876543210",
                "service": "NSP Scholarship",
                "status": "processing",
                "confirmation_number": "NSP2026NEW",
                "portal": "nsp",
                "submitted_at": "2026-05-28T12:00:00+00:00",
            },
            {
                "id": "app-old",
                "phone": "919876543210",
                "service": "NSP Scholarship",
                "status": "submitted",
                "confirmation_number": "NSP2026OLD",
                "portal": "nsp",
                "submitted_at": "2026-05-27T12:00:00+00:00",
            },
        ]
        activity_chain = MagicMock()
        activity_chain.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = []
        supabase_mock = MagicMock()
        supabase_mock.table.side_effect = [applications_chain, activity_chain]

        with patch.object(live_router, "supabase", supabase_mock):
            snapshot = await live_router.get_dashboard_snapshot("919876543210", token_phone="919876543210")

        self.assertEqual(snapshot["summary"], {"total": 1, "submitted": 0, "pending": 0, "failed": 0})
        self.assertEqual([app["confirmation_number"] for app in snapshot["applications"]], ["NSP2026NEW"])

    async def test_get_dashboard_snapshot_rejects_mismatched_token(self):
        with self.assertRaises(HTTPException) as ctx:
            await live_router.get_dashboard_snapshot("919876543210", token_phone="911234567890")

        self.assertEqual(ctx.exception.status_code, 403)

    async def test_get_dashboard_snapshot_requires_authentication(self):
        with self.assertRaises(HTTPException) as ctx:
            await live_router.get_dashboard_snapshot("919876543210", token_phone=None)

        self.assertEqual(ctx.exception.status_code, 401)

    async def test_post_activity_event_normalizes_phone_before_insert(self):
        activity_table = MagicMock()
        activity_table.insert.return_value.execute.return_value = None

        supabase_mock = MagicMock()
        supabase_mock.table.return_value = activity_table

        with patch.object(live_router, "supabase", supabase_mock):
            response = await live_router.post_activity_event(
                live_router.ActivityEvent(phone="09876543210", event="Application submitted"),
                token_phone="919876543210",
            )

        self.assertEqual(response, {"ok": True})
        inserted_payload = activity_table.insert.call_args.args[0]
        self.assertEqual(inserted_payload["phone"], "919876543210")

    async def test_get_live_session_requires_owner_authentication(self):
        session_table = MagicMock()
        session_table.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
            {"session_id": "live-123", "phone": "919876543210", "status": "in_progress"}
        ]

        supabase_mock = MagicMock()
        supabase_mock.table.return_value = session_table

        with patch.object(live_router, "supabase", supabase_mock):
            session = await live_router.get_live_session("live-123", token_phone="919876543210")

        self.assertEqual(session["session_id"], "live-123")

        with patch.object(live_router, "supabase", supabase_mock):
            with self.assertRaises(HTTPException) as ctx:
                await live_router.get_live_session("live-123", token_phone=None)

        self.assertEqual(ctx.exception.status_code, 401)

        with patch.object(live_router, "supabase", supabase_mock):
            with self.assertRaises(HTTPException) as ctx:
                await live_router.get_live_session("live-123", token_phone="911234567890")

        self.assertEqual(ctx.exception.status_code, 403)


if __name__ == "__main__":
    unittest.main()
