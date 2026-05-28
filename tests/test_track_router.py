import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi import HTTPException

from gov_agent import track_router


class TrackRouterTests(unittest.IsolatedAsyncioTestCase):
    async def test_get_timeline_rejects_stale_duplicate_confirmation_number(self):
        requested_query = MagicMock()
        requested_query.select.return_value.eq.return_value.execute.return_value = SimpleNamespace(
            data=[
                {
                    "confirmation_number": "NSP2026OLD",
                    "service": "NSP Scholarship",
                    "status": "submitted",
                    "submitted_at": "2026-05-27T12:00:00+00:00",
                    "timeline_steps": [],
                    "portal": "nsp",
                    "phone": "919999999999",
                }
            ]
        )

        latest_query = MagicMock()
        latest_query.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = SimpleNamespace(
            data=[
                {
                    "confirmation_number": "NSP2026NEW",
                    "portal": "nsp",
                    "phone": "919999999999",
                    "submitted_at": "2026-05-28T12:00:00+00:00",
                }
            ]
        )

        supabase_mock = MagicMock()
        supabase_mock.table.side_effect = [requested_query, latest_query]

        with patch.object(track_router, "supabase", supabase_mock):
            with self.assertRaises(HTTPException) as ctx:
                await track_router.get_timeline("NSP2026OLD")

        self.assertEqual(ctx.exception.status_code, 404)

    async def test_get_timeline_allows_latest_confirmation_number(self):
        requested_query = MagicMock()
        requested_query.select.return_value.eq.return_value.execute.return_value = SimpleNamespace(
            data=[
                {
                    "confirmation_number": "NSP2026NEW",
                    "service": "NSP Scholarship",
                    "status": "processing",
                    "submitted_at": "2026-05-28T12:00:00+00:00",
                    "timeline_steps": [{"step": "Applied", "done": True}],
                    "portal": "nsp",
                    "phone": "919999999999",
                }
            ]
        )

        latest_query = MagicMock()
        latest_query.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = SimpleNamespace(
            data=[
                {
                    "confirmation_number": "NSP2026NEW",
                    "portal": "nsp",
                    "phone": "919999999999",
                    "submitted_at": "2026-05-28T12:00:00+00:00",
                }
            ]
        )

        supabase_mock = MagicMock()
        supabase_mock.table.side_effect = [requested_query, latest_query]

        with patch.object(track_router, "supabase", supabase_mock):
            timeline = await track_router.get_timeline("NSP2026NEW")

        self.assertEqual(timeline["confirmation_number"], "NSP2026NEW")
        self.assertEqual(timeline["status"], "processing")


if __name__ == "__main__":
    unittest.main()
