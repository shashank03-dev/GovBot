import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import HTTPException

from gov_agent import npci_agent, npci_router


class MockBankVerifyTests(unittest.IsolatedAsyncioTestCase):
    async def test_mock_bank_verify_returns_seeded_success_with_bank_metadata(self):
        existing_chain = MagicMock()
        existing_chain.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = SimpleNamespace(data=[])

        insert_chain = MagicMock()
        update_chain = MagicMock()

        supabase_mock = MagicMock()
        supabase_mock.table.side_effect = [existing_chain, insert_chain, update_chain]

        sleep_mock = AsyncMock(return_value=None)
        with (
            patch.object(npci_router, "supabase", supabase_mock),
            patch.object(npci_router.asyncio, "sleep", new=sleep_mock),
            patch.object(npci_router.config, "MOCK_NPCI_DELAY_SECONDS", 0),
        ):
            result = await npci_router.mock_bank_verify(
                npci_router.BankVerifyRequest(
                    phone="919632363213",
                    account_number="44344429113",
                    ifsc_code="SBIN0012345",
                )
            )

        self.assertEqual(result.status, "success")
        sleep_mock.assert_not_awaited()
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

        sleep_mock = AsyncMock(return_value=None)
        with (
            patch.object(npci_router, "supabase", supabase_mock),
            patch.object(npci_router.asyncio, "sleep", new=sleep_mock),
            patch.object(npci_router.config, "MOCK_NPCI_DELAY_SECONDS", 0),
        ):
            result = await npci_router.mock_bank_verify(
                npci_router.BankVerifyRequest(
                    phone="919632363213",
                    account_number="99999999999",
                    ifsc_code="SBIN0012345",
                )
            )

        self.assertEqual(result.status, "failed")
        sleep_mock.assert_not_awaited()
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


class BankReadyRouteAuthTests(unittest.IsolatedAsyncioTestCase):
    async def test_mark_bank_ready_requires_authenticated_phone(self):
        with self.assertRaises(HTTPException) as ctx:
            await npci_router.mark_bank_ready(
                npci_router.BankReadyRequest(phone="919632363213"),
                token_phone=None,
            )

        self.assertEqual(ctx.exception.status_code, 401)

    async def test_mark_bank_ready_rejects_different_phone(self):
        with self.assertRaises(HTTPException) as ctx:
            await npci_router.mark_bank_ready(
                npci_router.BankReadyRequest(phone="919632363213"),
                token_phone="919999999999",
            )

        self.assertEqual(ctx.exception.status_code, 403)

    async def test_mark_bank_ready_uses_authenticated_phone(self):
        with patch.object(
            npci_agent,
            "ensure_disbursement_ready",
            return_value={"ready": True, "phone": "919632363213"},
        ) as ensure_ready:
            result = await npci_router.mark_bank_ready(
                npci_router.BankReadyRequest(phone="9632363213"),
                token_phone="919632363213",
            )

        self.assertEqual(result["ready"], True)
        ensure_ready.assert_called_once_with("919632363213")
