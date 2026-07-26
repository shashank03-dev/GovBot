import importlib
import pathlib
import sys
import types
import unittest
from unittest.mock import AsyncMock, patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from gov_agent import apply_prefill as ap
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


COMPLETE_NSP_PROFILE = {
    "full_name": "Rahul Kumar",
    "dob": "12/05/2003",
    "income": 180000,
    "bank_ifsc": "SBIN0012345",
    "bank_account": "44344429113",
}


class ApplyPrefillPureTests(unittest.TestCase):
    def test_nsp_complete_when_bank_verified_even_without_bank_fields(self):
        profile = {"full_name": "A", "dob": "01/01/2003", "income": 90000}
        self.assertTrue(ap.is_portal_complete(profile, "nsp", bank_verified=True))
        self.assertFalse(ap.is_portal_complete(profile, "nsp", bank_verified=False))

    def test_nsp_unverified_requires_bank_fields_in_order(self):
        profile = {"full_name": "A", "dob": "01/01/2003", "income": 90000}
        _, missing = ap.resolve_prefill(profile, "nsp", bank_verified=False)
        self.assertEqual(missing, ["bank_ifsc", "bank_account"])

    def test_resolve_prefill_normalizes_types(self):
        filled, missing = ap.resolve_prefill(
            {"full_name": "A", "dob": "01/01/2003", "income": "90000"}, "nsp", bank_verified=True
        )
        self.assertEqual(missing, [])
        self.assertEqual(filled["income"], 90000)
        self.assertIsInstance(filled["income"], int)

    def test_ssp_partial_missing_preserves_ask_order(self):
        profile = {"full_name": "Asha", "dob": "01/01/2004", "income": 90000, "caste": "OBC"}
        _, missing = ap.resolve_prefill(profile, "ssp")
        self.assertEqual(missing, ["institution", "course"])

    def test_summary_masks_bank_account_and_shows_verified(self):
        filled, missing = ap.resolve_prefill(COMPLETE_NSP_PROFILE, "nsp", bank_verified=False)
        summary = ap.build_summary("nsp", filled, missing, bank_verified=False)
        self.assertIn("••••9113", summary)
        self.assertNotIn("44344429113", summary)
        self.assertIn("CONFIRM", summary)

        verified_summary = ap.build_summary("nsp", {"name": "R"}, [], bank_verified=True)
        self.assertIn("already verified", verified_summary)

    def test_match_edit_field_requires_edit_or_change_prefix(self):
        self.assertEqual(ap.match_edit_field("nsp", "EDIT income"), "income")
        self.assertEqual(ap.match_edit_field("nsp", "change bank a/c"), "bank_account")
        self.assertIsNone(ap.match_edit_field("nsp", "income"))
        self.assertIsNone(ap.match_edit_field("nsp", "edit"))


class ApplyPrefillFlowTests(unittest.IsolatedAsyncioTestCase):
    async def test_portal_select_complete_profile_skips_digilocker(self):
        flow_router = _load_flow_router()
        session = {"state": "portal_select", "collected_data": {}}
        msg = WhatsAppIncoming(phone="919999999999", message_type="text", body="1")

        with patch.object(
            flow_router, "_load_profile", new=AsyncMock(return_value=dict(COMPLETE_NSP_PROFILE))
        ), patch.object(flow_router, "_bank_already_verified", return_value=True):
            reply, new_state, new_data = await flow_router.route(session, msg)

        self.assertEqual(new_state, "apply_review")
        self.assertNotIn("DigiLocker", reply)
        self.assertIn("CONFIRM", reply)
        self.assertEqual(new_data["name"], "Rahul Kumar")
        self.assertEqual(new_data["income"], 180000)
        self.assertTrue(new_data["_bank_verified"])

    async def test_portal_select_partial_profile_shows_digilocker(self):
        flow_router = _load_flow_router()
        session = {"state": "portal_select", "collected_data": {}}
        msg = WhatsAppIncoming(phone="919999999999", message_type="text", body="2")

        with patch.object(
            flow_router,
            "_load_profile",
            new=AsyncMock(return_value={"full_name": "Asha", "dob": "01/01/2004", "income": 90000}),
        ), patch.object(flow_router, "_bank_already_verified", return_value=False):
            reply, new_state, _ = await flow_router.route(session, msg)

        self.assertEqual(new_state, "digilocker_offer")
        self.assertIn("DigiLocker", reply)

    async def test_manual_entry_returning_user_asks_only_missing(self):
        flow_router = _load_flow_router()
        session = {"state": "digilocker_offer", "collected_data": {"portal": "ssp"}}
        msg = WhatsAppIncoming(phone="919999999999", message_type="text", body="no")

        with patch.object(
            flow_router,
            "_load_profile",
            new=AsyncMock(return_value={"full_name": "Asha", "dob": "01/01/2004", "income": 90000, "caste": "OBC"}),
        ):
            reply, new_state, new_data = await flow_router.route(session, msg)

        self.assertEqual(new_state, "apply_collect_missing")
        self.assertEqual(new_data["_apply_missing"], ["institution", "course"])
        self.assertEqual(new_data["name"], "Asha")
        self.assertIn("institution", reply.lower())

    async def test_manual_entry_new_user_falls_back_to_sequential_flow(self):
        flow_router = _load_flow_router()
        session = {"state": "digilocker_offer", "collected_data": {"portal": "nsp"}}
        msg = WhatsAppIncoming(phone="919999999999", message_type="text", body="no")

        with patch.object(flow_router, "_load_profile", new=AsyncMock(return_value={})):
            reply, new_state, _ = await flow_router.route(session, msg)

        self.assertEqual(new_state, "collect_name")
        self.assertIn("full name", reply.lower())

    async def test_collect_missing_saves_field_and_advances(self):
        flow_router = _load_flow_router()
        session = {
            "state": "apply_collect_missing",
            "collected_data": {"portal": "ssp", "_apply_missing": ["institution", "course"], "name": "Asha"},
        }
        msg = WhatsAppIncoming(phone="919999999999", message_type="text", body="ABC College")

        with patch.object(flow_router, "_save_profile_field", new=AsyncMock()) as save_mock:
            reply, new_state, new_data = await flow_router.route(session, msg)

        save_mock.assert_awaited_once_with("919999999999", "institution", "ABC College")
        self.assertEqual(new_state, "apply_collect_missing")
        self.assertEqual(new_data["_apply_missing"], ["course"])
        self.assertEqual(new_data["institution"], "ABC College")

    async def test_collect_last_missing_field_moves_to_review(self):
        flow_router = _load_flow_router()
        session = {
            "state": "apply_collect_missing",
            "collected_data": {"portal": "ssp", "_apply_missing": ["course"], "name": "Asha", "institution": "ABC"},
        }
        msg = WhatsAppIncoming(phone="919999999999", message_type="text", body="BSc Physics")

        with patch.object(flow_router, "_save_profile_field", new=AsyncMock()):
            reply, new_state, new_data = await flow_router.route(session, msg)

        self.assertEqual(new_state, "apply_review")
        self.assertNotIn("_apply_missing", new_data)
        self.assertIn("CONFIRM", reply)

    async def test_review_confirm_requests_aadhaar_photo(self):
        flow_router = _load_flow_router()
        session = {"state": "apply_review", "collected_data": {"portal": "nsp", "_bank_verified": True}}
        msg = WhatsAppIncoming(phone="919999999999", message_type="text", body="CONFIRM")

        reply, new_state, _ = await flow_router.route(session, msg)

        self.assertEqual(new_state, "apply_await_document")
        self.assertIn("Aadhaar", reply)

    async def test_review_edit_then_value_returns_to_review(self):
        flow_router = _load_flow_router()
        session = {"state": "apply_review", "collected_data": {"portal": "nsp", "_bank_verified": True, "income": 180000}}
        edit_msg = WhatsAppIncoming(phone="919999999999", message_type="text", body="EDIT income")

        reply, new_state, data = await flow_router.route(session, edit_msg)
        self.assertEqual(new_state, "apply_edit_value")
        self.assertEqual(data["_apply_edit_field"], "income")

        value_msg = WhatsAppIncoming(phone="919999999999", message_type="text", body="200000")
        with patch.object(flow_router, "_save_profile_field", new=AsyncMock()) as save_mock:
            reply2, new_state2, data2 = await flow_router.route(
                {"state": new_state, "collected_data": data}, value_msg
            )

        save_mock.assert_awaited_once_with("919999999999", "income", 200000)
        self.assertEqual(new_state2, "apply_review")
        self.assertEqual(data2["income"], 200000)
        self.assertNotIn("_apply_edit_field", data2)

    async def test_await_document_nsp_unverified_runs_bank_verification(self):
        flow_router = _load_flow_router()
        session = {
            "state": "apply_await_document",
            "collected_data": {"portal": "nsp", "_bank_verified": False, "bank_ifsc": "SBIN0012345", "bank_account": "44344429113"},
        }
        msg = WhatsAppIncoming(phone="919999999999", message_type="image", body=None, media_id="media-1")

        with patch.object(
            flow_router, "_run_bank_verification", new=AsyncMock(return_value=("verified", "completed", {}))
        ) as verify_mock, patch.object(flow_router, "_submit_application", new=AsyncMock()) as submit_mock:
            reply, new_state, _ = await flow_router.route(session, msg)

        verify_mock.assert_awaited_once()
        submit_mock.assert_not_awaited()
        self.assertEqual(new_state, "completed")

    async def test_await_document_nsp_verified_submits_directly(self):
        flow_router = _load_flow_router()
        session = {
            "state": "apply_await_document",
            "collected_data": {"portal": "nsp", "_bank_verified": True},
        }
        msg = WhatsAppIncoming(phone="919999999999", message_type="image", body=None, media_id="media-1")

        with patch.object(
            flow_router, "_run_bank_verification", new=AsyncMock()
        ) as verify_mock, patch.object(
            flow_router, "_submit_application", new=AsyncMock(return_value=("done", "completed", {}))
        ) as submit_mock:
            reply, new_state, _ = await flow_router.route(session, msg)

        verify_mock.assert_not_awaited()
        submit_mock.assert_awaited_once()
        self.assertEqual(new_state, "completed")

    async def test_await_document_ssp_submits_without_bank(self):
        flow_router = _load_flow_router()
        session = {"state": "apply_await_document", "collected_data": {"portal": "ssp"}}
        msg = WhatsAppIncoming(phone="919999999999", message_type="image", body=None, media_id="media-1")

        with patch.object(
            flow_router, "_submit_application", new=AsyncMock(return_value=("done", "completed", {}))
        ) as submit_mock:
            reply, new_state, _ = await flow_router.route(session, msg)

        submit_mock.assert_awaited_once_with("919999999999", session["collected_data"], "ssp")
        self.assertEqual(new_state, "completed")

    async def test_await_document_without_image_reprompts(self):
        flow_router = _load_flow_router()
        session = {"state": "apply_await_document", "collected_data": {"portal": "ssp"}}
        msg = WhatsAppIncoming(phone="919999999999", message_type="text", body="hello")

        reply, new_state, _ = await flow_router.route(session, msg)

        self.assertEqual(new_state, "apply_await_document")
        self.assertIn("Aadhaar", reply)


if __name__ == "__main__":
    unittest.main()
