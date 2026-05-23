import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from gov_agent import flow_router
from gov_agent import renewal_router
from gov_agent.models import WhatsAppIncoming


class RenewalSummaryTests(unittest.TestCase):
    def test_build_summary_combines_document_expiries_and_portal_renewals(self):
        from gov_agent import renewal_intelligence

        docs_chain = MagicMock()
        docs_chain.select.return_value.eq.return_value.order.return_value.execute.return_value = SimpleNamespace(
            data=[
                {
                    "id": "doc-1",
                    "doc_type": "income_cert",
                    "expiry_date": "2026-06-05",
                    "created_at": "2026-05-20T10:00:00",
                },
                {
                    "id": "doc-2",
                    "doc_type": "marksheet",
                    "expiry_date": None,
                    "created_at": "2026-05-21T10:00:00",
                },
            ]
        )

        reminders_chain = MagicMock()
        reminders_chain.select.return_value.eq.return_value.order.return_value.execute.return_value = SimpleNamespace(
            data=[
                {
                    "id": "rem-1",
                    "portal": "nsp",
                    "renewal_due_date": "2026-06-15",
                    "sent_at": None,
                    "created_at": "2026-05-22T10:00:00",
                }
            ]
        )

        supabase_mock = MagicMock()
        supabase_mock.table.side_effect = [docs_chain, reminders_chain]

        with patch.object(renewal_intelligence, "supabase", supabase_mock):
            summary = renewal_intelligence.build_summary("919632363213", today="2026-05-23")

        self.assertEqual(summary["document_expiries"][0]["doc_type"], "income_cert")
        self.assertEqual(summary["document_expiries"][0]["days_until"], 13)
        self.assertEqual(summary["renewal_reminders"][0]["portal"], "nsp")
        self.assertEqual(summary["renewal_reminders"][0]["days_until"], 23)
        self.assertEqual(summary["document_expiries"][0]["label"], "Income Certificate")
        self.assertEqual(summary["renewal_reminders"][0]["label"], "NSP")

    def test_build_whatsapp_summary_uses_reminder_only_stage_friendly_wording(self):
        from gov_agent import renewal_intelligence

        with patch.object(
            renewal_intelligence,
            "build_summary",
            return_value={
                "phone": "919632363213",
                "document_expiries": [
                    {
                        "label": "Income Certificate",
                        "expiry_date": "2026-06-05",
                        "days_until": 13,
                    }
                ],
                "renewal_reminders": [
                    {
                        "portal": "nsp",
                        "label": "NSP",
                        "renewal_due_date": "2026-06-15",
                        "days_until": 23,
                    }
                ],
            },
        ):
            reply = renewal_intelligence.build_whatsapp_summary("919632363213")

        self.assertIn("Your Income Certificate expires on 05 Jun 2026.", reply)
        self.assertIn("Your NSP renewal is due on 15 Jun 2026.", reply)
        self.assertIn("I'll remind you before each deadline.", reply)
        self.assertNotIn("Reply REMIND NSP", reply)


class RenewalConversationTests(unittest.IsolatedAsyncioTestCase):
    async def test_route_answers_portal_renewal_question_from_combined_summary(self):
        session = {"state": "greeting", "collected_data": {}}
        msg = WhatsAppIncoming(
            phone="919632363213",
            message_type="text",
            body="when should i renew nsp?",
        )

        mock_reply = (
            "📅 *Renewal and Expiry Summary*\n\n"
            "Scholarship renewals:\n"
            "• NSP due on 15 Jun 2026 (23 days left)\n\n"
            "Reply REMIND NSP to update it."
        )

        with patch.object(
            flow_router.renewal_intelligence,
            "build_whatsapp_summary",
            return_value=mock_reply,
        ):
            reply, next_state, next_data = await flow_router.route(session, msg)

        self.assertEqual(next_state, "greeting")
        self.assertEqual(next_data, {})
        self.assertIn("NSP due on 15 Jun 2026", reply)


class RenewalRouterSummaryTests(unittest.IsolatedAsyncioTestCase):
    async def test_get_renewal_summary_returns_combined_payload(self):
        mock_summary = {
            "phone": "919632363213",
            "document_expiries": [{"doc_type": "income_cert", "days_until": 13}],
            "renewal_reminders": [{"portal": "nsp", "days_until": 23}],
        }

        with patch.object(
            renewal_router.renewal_intelligence,
            "build_summary",
            return_value=mock_summary,
        ):
            result = await renewal_router.get_renewal_summary("919632363213")

        self.assertEqual(result, mock_summary)


if __name__ == "__main__":
    unittest.main()
