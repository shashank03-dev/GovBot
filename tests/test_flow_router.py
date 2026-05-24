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
    async def test_collect_name_watch_live_does_not_send_unsolicited_message(self):
        flow_router = _load_flow_router()
        session = {"state": "collect_name", "collected_data": {"portal": "nsp"}}
        msg = WhatsAppIncoming(phone="919999999999", message_type="text", body="Test User")

        with patch.object(flow_router, "_save_profile_field", new=AsyncMock()) as save_profile_mock, patch.object(
            flow_router,
            "_emit_activity",
            new=AsyncMock(),
        ) as emit_activity_mock, patch.object(
            flow_router,
            "_advance",
            new=AsyncMock(),
        ) as advance_mock, patch(
            "gov_agent.live_router.create_live_session",
            new=AsyncMock(),
        ) as create_live_session_mock, patch(
            "gov_agent.whatsapp_sender.send_message",
            new=AsyncMock(return_value=True),
        ) as send_message_mock:
            reply, new_state, new_data = await flow_router.route(session, msg)

        save_profile_mock.assert_awaited_once_with("919999999999", "full_name", "Test User")
        emit_activity_mock.assert_awaited_once()
        create_live_session_mock.assert_awaited_once()
        advance_mock.assert_awaited_once()
        send_message_mock.assert_not_awaited()
        self.assertEqual(reply, "Date of birth? (DD/MM/YYYY)")
        self.assertEqual(new_state, "collect_dob")
        self.assertEqual(new_data["name"], "Test User")
        self.assertIn("session_id", new_data)

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

    async def test_bank_verify_failed_requires_explicit_retry_or_continue(self):
        flow_router = _load_flow_router()
        session = {
            "state": "bank_verify_failed",
            "collected_data": {"portal": "nsp", "bank_ifsc": "SBIN0012345"},
        }
        msg = WhatsAppIncoming(phone="919999999999", message_type="text", body="maybe")

        with patch.object(flow_router, "_submit_application", new=AsyncMock()) as submit_mock:
            reply, new_state, new_data = await flow_router.route(session, msg)

        submit_mock.assert_not_awaited()
        self.assertIn("RETRY", reply)
        self.assertIn("CONTINUE", reply)
        self.assertEqual(new_state, "bank_verify_failed")
        self.assertEqual(new_data, session["collected_data"])

    async def test_bank_verify_failed_continue_calls_submit_application(self):
        flow_router = _load_flow_router()
        session = {
            "state": "bank_verify_failed",
            "collected_data": {"portal": "nsp", "bank_ifsc": "SBIN0012345"},
        }
        msg = WhatsAppIncoming(phone="919999999999", message_type="text", body="CONTINUE")

        with patch.object(
            flow_router,
            "_submit_application",
            new=AsyncMock(return_value=("submitted", "completed", {"portal": "nsp"})),
        ) as submit_mock:
            reply, new_state, new_data = await flow_router.route(session, msg)

        submit_mock.assert_awaited_once_with("919999999999", session["collected_data"], "nsp")
        self.assertEqual((reply, new_state, new_data), ("submitted", "completed", {"portal": "nsp"}))

    async def test_bank_verify_failed_continue_trims_whitespace(self):
        flow_router = _load_flow_router()
        session = {
            "state": "bank_verify_failed",
            "collected_data": {"portal": "nsp", "bank_ifsc": "SBIN0012345"},
        }
        msg = WhatsAppIncoming(phone="919999999999", message_type="text", body=" CONTINUE ")

        with patch.object(
            flow_router,
            "_submit_application",
            new=AsyncMock(return_value=("submitted", "completed", {"portal": "nsp"})),
        ) as submit_mock:
            reply, new_state, new_data = await flow_router.route(session, msg)

        submit_mock.assert_awaited_once_with("919999999999", session["collected_data"], "nsp")
        self.assertEqual((reply, new_state, new_data), ("submitted", "completed", {"portal": "nsp"}))

    async def test_ocr_confirm_no_reprompts_for_aadhaar_upload(self):
        flow_router = _load_flow_router()
        session = {
            "state": "ocr_confirm",
            "collected_data": {
                "portal": "nsp",
                "ocr": {"name": "Test User", "dob": "30/10/2006"},
                "_pending_ocr_confirm": True,
            },
        }
        msg = WhatsAppIncoming(phone="919999999999", message_type="text", body="NO")

        reply, new_state, new_data = await flow_router.route(session, msg)

        self.assertEqual(reply, "Please re-upload your Aadhaar card 📎")
        self.assertEqual(new_state, "awaiting_document")
        self.assertNotIn("ocr", new_data)
        self.assertNotIn("_pending_ocr_confirm", new_data)

    async def test_check_status_success_includes_track_link(self):
        flow_router = _load_flow_router()
        session = {"state": "check_status", "collected_data": {}}
        msg = WhatsAppIncoming(phone="919999999999", message_type="text", body="NSP/2026 123")
        response = types.SimpleNamespace(
            data=[
                {
                    "confirmation_number": "NSP/2026 123",
                    "status": "approved",
                    "service": "NSP",
                }
            ]
        )

        with patch.object(flow_router, "supabase") as supabase_mock:
            supabase_mock.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value = response
            reply, new_state, new_data = await flow_router.route(session, msg)

        self.assertIn("Status: APPROVED", reply)
        self.assertIn("Service: NSP", reply)
        self.assertIn("Track status:", reply)
        self.assertIn("NSP%2F2026%20123", reply)
        self.assertEqual(new_state, "greeting")
        self.assertEqual(new_data, {})

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

    async def test_document_request_prompts_for_retrieval_mode(self):
        flow_router = _load_flow_router()
        session = {"state": "greeting", "collected_data": {}}
        msg = WhatsAppIncoming(phone="919999999999", message_type="text", body="show pan")

        with patch.object(
            flow_router,
            "get_latest_user_document",
            return_value={"id": "doc-pan-1", "doc_type": "pan", "storage_path": "9199/pan/file.pdf"},
        ):
            reply, new_state, new_data = await flow_router.route(session, msg)

        self.assertIn("QUICK", reply.upper())
        self.assertIn("VAULT", reply.upper())
        self.assertEqual(new_state, "document_retrieval_mode")
        self.assertEqual(new_data["_requested_doc_type"], "pan")
        self.assertEqual(new_data["_requested_document_id"], "doc-pan-1")

    async def test_document_request_quick_mode_asks_for_passkey(self):
        flow_router = _load_flow_router()
        session = {
            "state": "document_retrieval_mode",
            "collected_data": {"_requested_doc_type": "pan", "_requested_document_id": "doc-pan-1"},
        }
        msg = WhatsAppIncoming(phone="919999999999", message_type="text", body="quick")

        with patch.object(flow_router, "_load_profile", new=AsyncMock(return_value={"passkey_hash": "hash"})):
            reply, new_state, new_data = await flow_router.route(session, msg)

        self.assertEqual(reply, "🔐 Enter your 4-digit passkey:")
        self.assertEqual(new_state, "passkey_verify")
        self.assertEqual(new_data["_document_delivery_mode"], "chat")

    async def test_document_request_vault_mode_returns_login_handoff_for_focused_link(self):
        flow_router = _load_flow_router()
        session = {
            "state": "document_retrieval_mode",
            "collected_data": {"_requested_doc_type": "pan", "_requested_document_id": "doc-pan-1"},
        }
        msg = WhatsAppIncoming(phone="919999999999", message_type="text", body="vault")

        with patch(
            "gov_agent.qr_login.get_login_url",
            return_value="https://app.example/login?token=abc&phone=919999999999&next=%2Fdocuments%3Fdocument%3Ddoc-pan-1",
        ) as get_login_url_mock:
            reply, new_state, new_data = await flow_router.route(session, msg)

        get_login_url_mock.assert_called_once_with("919999999999", "/documents?document=doc-pan-1")
        self.assertIn("https://app.example/login?token=abc&phone=919999999999&next=%2Fdocuments%3Fdocument%3Ddoc-pan-1", reply)
        self.assertEqual(new_state, "greeting")
        self.assertNotIn("_requested_doc_type", new_data)

    async def test_passkey_verify_returns_structured_document_media_response(self):
        flow_router = _load_flow_router()
        session = {
            "state": "passkey_verify",
            "collected_data": {
                "_requested_doc_type": "aadhaar",
                "_requested_document_id": "doc-aadhaar-1",
                "_document_delivery_mode": "chat",
            },
        }
        msg = WhatsAppIncoming(phone="919999999999", message_type="text", body="1234")

        with patch.object(flow_router, "_load_profile", new=AsyncMock(return_value={"passkey_hash": "digest"})), patch(
            "gov_agent.flow_router.verify_passkey",
            return_value=True,
        ), patch(
            "gov_agent.flow_router.get_user_document",
            return_value={
                "id": "doc-aadhaar-1",
                "phone": "919999999999",
                "doc_type": "aadhaar",
                "mime_type": "image/jpeg",
                "original_filename": "aadhaar.jpg",
                "storage_path": "919999999999/aadhaar/current.jpg",
                "extracted_data": {"aadhaar_number": "1234 5678 9012", "full_name": "Asha Singh"},
            },
        ), patch(
            "gov_agent.flow_router.create_signed_document_url",
            return_value="https://signed.example/aadhaar.jpg",
        ):
            reply, new_state, new_data = await flow_router.route(session, msg)

        self.assertEqual(reply["kind"], "document_media_with_details")
        self.assertEqual(reply["media"]["link"], "https://signed.example/aadhaar.jpg")
        self.assertIn("XXXX", reply["text"])
        self.assertNotIn("1234 5678 9012", reply["text"])
        self.assertEqual(new_state, "greeting")
        self.assertEqual(new_data, {})

    async def test_digilocker_check_for_nsp_moves_to_review_pending(self):
        flow_router = _load_flow_router()
        session = {"state": "digilocker_awaiting_auth", "collected_data": {"portal": "nsp"}}
        msg = WhatsAppIncoming(phone="919999999999", message_type="text", body="CHECK")

        with patch("gov_agent.digilocker_agent.is_digilocker_connected", return_value=True), patch(
            "gov_agent.digilocker_router.get_latest_review_session_for_phone",
            return_value={
                "review_session_id": "review-123",
                "portal": "nsp",
                "portal_label": "NSP",
                "consent_id": "mock-consent-123",
                "documents": [{"name": "Aadhaar Card"}, {"name": "Income Certificate"}],
                "imported_fields": {"name": "Test User", "dob": "2006-10-30", "income": 25000},
                "missing_fields": ["aadhaar_number"],
            },
        ), patch(
            "gov_agent.digilocker_router.format_review_summary",
            return_value="📋 DigiLocker Review for NSP\n\nDocuments received: Aadhaar Card, Income Certificate\n\nReply *USE* to continue, *EDIT* to review first, or *SAVE* to keep this for later.",
        ):
            reply, new_state, new_data = await flow_router.route(session, msg)

        self.assertIn("DigiLocker Review for NSP", reply)
        self.assertIn("Reply *USE* to continue", reply)
        self.assertEqual(new_state, "digilocker_review_pending")
        self.assertEqual(new_data["review_session_id"], "review-123")

    async def test_digilocker_review_use_for_nsp_initializes_profile_and_moves_to_bank_step(self):
        flow_router = _load_flow_router()
        session = {"state": "digilocker_review_pending", "collected_data": {"portal": "nsp", "review_session_id": "review-123"}}
        msg = WhatsAppIncoming(phone="919999999999", message_type="text", body="USE")

        with patch(
            "gov_agent.digilocker_router.apply_review_decision_for_phone",
            return_value={
                "portal": "nsp",
                "consent_id": "mock-consent-123",
                "imported_fields": {"name": "Test User", "dob": "2006-10-30", "income": 0, "aadhaar_number": "XXXX-XXXX-5424"},
                "next_url": "/nsp/apply?review_session=review-123",
                "status": "approved",
            },
        ), patch.object(
            flow_router,
            "_save_profile_field",
            new=AsyncMock(),
        ) as save_profile_mock, patch.object(
            flow_router,
            "_emit_activity",
            new=AsyncMock(),
        ) as emit_activity_mock, patch.object(
            flow_router,
            "_advance",
            new=AsyncMock(),
        ) as advance_mock, patch(
            "gov_agent.live_router.create_live_session",
            new=AsyncMock(),
        ) as create_live_session_mock, patch(
            "gov_agent.flow_router.uuid.uuid4",
            return_value="prefill-session-id",
        ):
            reply, new_state, new_data = await flow_router.route(session, msg)

        self.assertIn("Bank Account Verification", reply)
        self.assertEqual(new_state, "collect_bank_ifsc")
        self.assertEqual(new_data["income"], 0)
        self.assertEqual(new_data["media_id"], "mock-consent-123")
        self.assertEqual(new_data["session_id"], "prefill-session-id")
        save_profile_mock.assert_has_awaits([
            unittest.mock.call("919999999999", "full_name", "Test User"),
            unittest.mock.call("919999999999", "dob", "2006-10-30"),
            unittest.mock.call("919999999999", "income", 0),
        ])
        emit_activity_mock.assert_awaited_once_with("919999999999", "📝 Profile collection started")
        create_live_session_mock.assert_awaited_once_with("prefill-session-id", "919999999999")
        advance_mock.assert_awaited_once_with(
            "prefill-session-id",
            3,
            {"name": "Test User", "dob": "2006-10-30", "income": 0},
        )

    async def test_digilocker_review_save_returns_to_greeting(self):
        flow_router = _load_flow_router()
        session = {"state": "digilocker_review_pending", "collected_data": {"portal": "nsp", "review_session_id": "review-123"}}
        msg = WhatsAppIncoming(phone="919999999999", message_type="text", body="SAVE")

        with patch(
            "gov_agent.digilocker_router.apply_review_decision_for_phone",
            return_value={
                "portal": "nsp",
                "status": "saved",
                "next_url": "/profile?review_session=review-123",
            },
        ):
            reply, new_state, new_data = await flow_router.route(session, msg)

        self.assertIn("Saved to your GovBot profile", reply)
        self.assertIn("/profile?review_session=review-123", reply)
        self.assertEqual(new_state, "greeting")
        self.assertEqual(new_data, {})

    async def test_passkey_verify_wrong_pin_stays_in_loop(self):
        flow_router = _load_flow_router()
        session = {"state": "passkey_verify", "collected_data": {"_reveal_field": "bank_account"}}
        msg = WhatsAppIncoming(phone="919999999999", message_type="text", body="1111")

        with patch.object(flow_router, "_load_profile", new=AsyncMock(return_value={"passkey_hash": "deadbeef"})), patch(
            "gov_agent.flow_router.verify_passkey",
            return_value=False,
        ):
            reply, new_state, _ = await flow_router.route(session, msg)

        self.assertEqual(reply, "❌ Wrong passkey. Try again:")
        self.assertEqual(new_state, "passkey_verify")

    async def test_pm_kisan_valid_identifier_returns_agent_message(self):
        flow_router = _load_flow_router()
        session = {"state": "pm_kisan_aadhaar", "collected_data": {}}
        msg = WhatsAppIncoming(phone="919999999999", message_type="text", body="12345678901")

        with patch(
            "gov_agent.pm_kisan_agent.check_pm_kisan_status",
            new=AsyncMock(return_value={"message": "PM-KISAN status reply"}),
        ):
            reply, new_state, _ = await flow_router.route(session, msg)

        self.assertIn("PM-KISAN status reply", reply)
        self.assertEqual(new_state, "greeting")

    async def test_translate_reply_uses_text_router_for_supported_language(self):
        flow_router = _load_flow_router()

        with patch.object(
            flow_router,
            "generate_text_reply",
            new=AsyncMock(return_value="अनुवाद"),
        ):
            result = await flow_router.translate_reply("Hello", "hi")

        self.assertEqual(result, "अनुवाद")

    async def test_pmss_awaiting_document_submits_after_image_upload(self):
        flow_router = _load_flow_router()
        session = {"state": "pmss_awaiting_document", "collected_data": {"portal": "pmss", "name": "Test User"}}
        msg = WhatsAppIncoming(
            phone="919999999999",
            message_type="image",
            media_id="media-1",
            body="",
        )

        with patch.object(
            flow_router,
            "_submit_application",
            new=AsyncMock(return_value=("submitted", "completed", {"portal": "pmss", "media_id": "media-1"})),
        ) as submit_mock:
            reply, new_state, new_data = await flow_router.route(session, msg)

        submit_mock.assert_awaited_once()
        self.assertEqual((reply, new_state), ("submitted", "completed"))
        self.assertEqual(new_data["media_id"], "media-1")

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
