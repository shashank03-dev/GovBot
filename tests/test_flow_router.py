import importlib
import pathlib
import sys
import types
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from gov_agent.models import WhatsAppIncoming


def _load_flow_router():
    existing = sys.modules.get("gov_agent.flow_router")
    if isinstance(existing, types.SimpleNamespace):
        sys.modules.pop("gov_agent.flow_router", None)
    sys.modules.setdefault(
        "gov_agent.rag_engine",
        types.SimpleNamespace(query_eligibility=None),
    )
    sys.modules.setdefault(
        "gov_agent.graph",
        types.SimpleNamespace(run_application=None),
    )
    return importlib.import_module("gov_agent.flow_router")


def _load_session_manager():
    sys.modules["gov_agent.flow_router"] = _load_flow_router()
    return importlib.import_module("gov_agent.session_manager")


class FlowRouterTests(unittest.IsolatedAsyncioTestCase):
    async def test_submit_application_uses_auto_login_dashboard_link(self):
        flow_router = _load_flow_router()

        with patch(
            "gov_agent.whatsapp_sender.send_message",
            new=AsyncMock(return_value=True),
        ), patch.object(
            flow_router.graph,
            "run_application",
            new=AsyncMock(return_value={
                "submission_result": {"confirmation_number": "NSP2026LINKTEST"},
            }),
        ), patch(
            "gov_agent.qr_login.get_login_url",
            return_value="https://app.example/login?token=abc&phone=919999999999&next=%2Fdashboard",
        ):
            reply, new_state, _ = await flow_router._submit_application(
                "919999999999",
                {"name": "Test User", "dob": "30/10/2006", "income": 25000, "media_id": "media-1"},
                "nsp",
            )

        self.assertIn("https://app.example/login?token=abc&phone=919999999999&next=%2Fdashboard", reply)
        self.assertNotIn("/dashboard", reply.split("View all your applications:\n", 1)[1])
        self.assertEqual(new_state, "completed")

    async def test_collect_bank_account_submits_application_after_successful_verification(self):
        flow_router = _load_flow_router()
        session = {
            "state": "collect_bank_account",
            "collected_data": {
                "bank_ifsc": "SBIN0012345",
                "portal": "nsp",
                "name": "Test User",
            },
        }
        msg = WhatsAppIncoming(phone="919999999999", message_type="text", body="44344429113")

        with patch("gov_agent.npci_agent.send_verification_request", new=AsyncMock(return_value={
            "success": True,
            "beneficiary_name": "Test User",
        })) as verify_mock, patch(
            "gov_agent.npci_agent.notify_verification_status",
            new=AsyncMock(),
        ) as notify_mock, patch(
            "gov_agent.whatsapp_sender.send_message",
            new=AsyncMock(return_value=True),
        ), patch.object(
            flow_router.graph,
            "run_application",
            new=AsyncMock(return_value={
                "submission_result": {"confirmation_number": "NSP20261234"},
            }),
        ) as run_application_mock:
            reply, new_state, new_data = await flow_router.route(session, msg)

        verify_mock.assert_awaited_once_with("919999999999", "44344429113", "SBIN0012345")
        notify_mock.assert_awaited_once()
        run_application_mock.assert_awaited_once()
        self.assertIn("Application Submitted!", reply)
        self.assertIn("NSP20261234", reply)
        self.assertEqual(new_state, "completed")
        self.assertEqual(new_data["bank_account"], "44344429113")

    def test_format_upload_result_hides_unreadable_warning_for_ready_aadhaar(self):
        flow_router = _load_flow_router()

        text = flow_router._format_upload_result(
            "aadhaar",
            {
                "status": "ready",
                "status_reason": "Core Aadhaar fields were extracted successfully, but secondary validity checks were inconclusive.",
                "extracted_data": {
                    "full_name": "Shashank Gowda T",
                    "dob": "2006-10-30",
                    "aadhaar_number": "XXXX-XXXX-5424",
                },
                "validation": {
                    "message": "Document could not be read — please upload a clearer image.",
                    "verification_status": "unknown",
                },
            },
        )

        self.assertIn("Your Aadhaar card has been saved.", text)
        self.assertIn("Core Aadhaar fields were extracted successfully", text)
        self.assertNotIn("Document could not be read", text)

    async def test_upload_aadhar_alias_opens_aadhaar_upload_flow(self):
        flow_router = _load_flow_router()
        session = {"state": "greeting", "collected_data": {}}
        msg = WhatsAppIncoming(phone="919999999999", message_type="text", body="upload aadhar")

        reply, new_state, new_data = await flow_router.route(session, msg)

        self.assertEqual(reply, "📎 Please send your Aadhaar card as a clear photo or document file.")
        self.assertEqual(new_state, "kyc_document_upload")
        self.assertEqual(new_data["_pending_doc_type"], "aadhaar")

    async def test_unknown_upload_command_returns_explicit_error(self):
        flow_router = _load_flow_router()
        session = {"state": "greeting", "collected_data": {}}
        msg = WhatsAppIncoming(phone="919999999999", message_type="text", body="upload ration card")

        reply, new_state, new_data = await flow_router.route(session, msg)

        self.assertIn("Command unavailable", reply)
        self.assertIn("upload aadhaar", reply)
        self.assertEqual(new_state, "greeting")
        self.assertEqual(new_data, {})

    async def test_restart_from_completed_returns_main_menu(self):
        flow_router = _load_flow_router()
        session = {"state": "completed", "collected_data": {"portal": "nsp"}}
        msg = WhatsAppIncoming(phone="919999999999", message_type="text", body="restart")

        reply, new_state, new_data = await flow_router.route(session, msg)

        self.assertEqual(reply, flow_router.MENU)
        self.assertEqual(new_state, "greeting")
        self.assertEqual(new_data, {})

    async def test_delete_session_falls_back_to_reset_when_delete_fails(self):
        session_manager = _load_session_manager()
        delete_step = MagicMock()
        delete_step.eq.return_value.execute.side_effect = Exception("fk blocked")
        delete_chain = MagicMock()
        delete_chain.delete.return_value = delete_step

        upsert_chain = MagicMock()
        supabase_mock = MagicMock()
        supabase_mock.table.side_effect = [delete_chain, upsert_chain]

        with patch.object(session_manager, "supabase", supabase_mock):
            await session_manager.delete_session("919999999999")

        upsert_chain.upsert.return_value.execute.assert_called_once_with()
        upsert_payload = upsert_chain.upsert.call_args.args[0]
        self.assertEqual(
            upsert_payload,
            {
                "phone": "919999999999",
                "state": "greeting",
                "collected_data": {},
            },
        )


if __name__ == "__main__":
    unittest.main()
