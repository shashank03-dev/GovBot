import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from gov_agent import npci_agent, npci_router


class MockBankVerifyTests(unittest.IsolatedAsyncioTestCase):
    async def test_mock_bank_verify_returns_seeded_success_with_bank_metadata(self):
        existing_chain = MagicMock()
        existing_chain.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(data=[])

        insert_chain = MagicMock()
        update_chain = MagicMock()

        supabase_mock = MagicMock()
        supabase_mock.table.side_effect = [existing_chain, insert_chain, update_chain]

        with (
            patch.object(npci_router, "supabase", supabase_mock),
            patch.object(npci_router.asyncio, "sleep", new=AsyncMock(return_value=None)),
        ):
            result = await npci_router.mock_bank_verify(
                npci_router.BankVerifyRequest(
                    phone="919632363213",
                    account_number="44344429113",
                    ifsc_code="SBIN0012345",
                )
            )

        self.assertEqual(result.status, "success")
        self.assertEqual(result.beneficiary_name, "SHASHANK GOWDA T")
        self.assertEqual(result.bank_name, "State Bank of India")
        self.assertEqual(result.branch, "HMT LAYOUT")
        self.assertIn("verified successfully", result.message.lower())

    async def test_mock_bank_verify_returns_deterministic_mismatch_failure(self):
        existing_chain = MagicMock()
        existing_chain.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(data=[])

        insert_chain = MagicMock()
        update_chain = MagicMock()

        supabase_mock = MagicMock()
        supabase_mock.table.side_effect = [existing_chain, insert_chain, update_chain]

        with (
            patch.object(npci_router, "supabase", supabase_mock),
            patch.object(npci_router.asyncio, "sleep", new=AsyncMock(return_value=None)),
        ):
            result = await npci_router.mock_bank_verify(
                npci_router.BankVerifyRequest(
                    phone="919632363213",
                    account_number="99999999999",
                    ifsc_code="SBIN0012345",
                )
            )

        self.assertEqual(result.status, "failed")
        self.assertIn("does not match bank records", result.message.lower())


class DisbursementReadyTests(unittest.TestCase):
    def test_ensure_disbursement_ready_creates_pending_record_for_latest_application(self):
        applications_chain = MagicMock()
        applications_chain.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = [
            {"confirmation_number": "NSP2026ABC123", "portal": "nsp"}
        ]

        existing_disbursement_chain = MagicMock()
        existing_disbursement_chain.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = []

        insert_disbursement_chain = MagicMock()
        insert_disbursement_chain.insert.return_value.execute.return_value.data = [{"id": "disp-1"}]

        activity_chain = MagicMock()

        supabase_mock = MagicMock()
        supabase_mock.table.side_effect = [
            applications_chain,
            existing_disbursement_chain,
            insert_disbursement_chain,
            activity_chain,
        ]

        with (
            patch.object(npci_agent, "supabase", supabase_mock),
            patch.object(
                npci_agent,
                "get_latest_verification",
                return_value={"id": "ver-1", "verified": True, "beneficiary_name": "SHASHANK GOWDA T"},
            ),
        ):
            result = npci_agent.ensure_disbursement_ready("919632363213")

        self.assertTrue(result["ready"])
        self.assertEqual(result["confirmation_number"], "NSP2026ABC123")
        self.assertEqual(result["status"], "pending")

        payload = insert_disbursement_chain.insert.call_args.args[0]
        self.assertEqual(payload["confirmation_number"], "NSP2026ABC123")
        self.assertEqual(payload["bank_verification_id"], "ver-1")
        self.assertEqual(payload["status"], "pending")
