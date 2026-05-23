import sys
import types
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

from gov_agent import portal_router


class PortalApplyTests(unittest.IsolatedAsyncioTestCase):
    async def test_apply_portal_records_activity_for_successful_web_submission(self):
        graph_stub = types.SimpleNamespace(
            run_application=AsyncMock(
                return_value={"submission_result": {"confirmation_number": "NSP2026ABC123"}}
            )
        )
        activity_chain = MagicMock()
        supabase_mock = MagicMock()
        supabase_mock.table.return_value = activity_chain

        body = portal_router.PortalApplyRequest(
            name="Shashank Gowda T",
            dob="2006-10-30",
            income=25000,
            media_id="web-demo",
            phone="919632363213",
        )

        with (
            patch.dict(sys.modules, {"gov_agent.graph": graph_stub}),
            patch.object(portal_router, "supabase", supabase_mock),
        ):
            result = await portal_router.apply_portal("nsp", body)

        self.assertEqual(result.status, "success")
        self.assertEqual(result.confirmation_number, "NSP2026ABC123")
        payload = activity_chain.insert.call_args.args[0]
        self.assertEqual(payload["phone"], "919632363213")
        self.assertIn("application received", payload["event"].lower())
