import unittest
import asyncio
from datetime import timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from gov_agent import auth_router


def _build_client() -> TestClient:
    app = FastAPI()
    app.include_router(auth_router.router, prefix="/auth")
    return TestClient(app)


def _build_fake_supabase_for_verify(row_id: int = 7):
    otp_table = MagicMock()

    select_query = MagicMock()
    select_query.eq.return_value = select_query
    select_query.gt.return_value = select_query
    select_query.limit.return_value = select_query
    select_query.execute.return_value = SimpleNamespace(data=[{"id": row_id}])

    update_query = MagicMock()
    update_query.eq.return_value = update_query
    update_query.select.return_value = update_query
    update_query.execute.return_value = SimpleNamespace(data=[{"id": row_id, "used": True}])

    otp_table.select.return_value = select_query
    otp_table.update.return_value = update_query

    fake_supabase = MagicMock()
    fake_supabase.table.return_value = otp_table
    return fake_supabase


def _build_fake_supabase_with_missing_verify_rate_table(*, otp_found: bool, row_id: int = 7):
    otp_table = MagicMock()

    select_query = MagicMock()
    select_query.eq.return_value = select_query
    select_query.gt.return_value = select_query
    select_query.limit.return_value = select_query
    select_query.execute.return_value = SimpleNamespace(data=[{"id": row_id}] if otp_found else [])

    update_query = MagicMock()
    update_query.eq.return_value = update_query
    update_query.select.return_value = update_query
    update_query.execute.return_value = SimpleNamespace(data=[{"id": row_id, "used": True}])

    otp_table.select.return_value = select_query
    otp_table.update.return_value = update_query

    verify_rate_table = MagicMock()

    verify_select_query = MagicMock()
    verify_select_query.eq.return_value = verify_select_query
    verify_select_query.limit.return_value = verify_select_query
    verify_select_query.execute.side_effect = Exception(
        {
            "message": "Could not find the table 'public.otp_verify_rate_limits' in the schema cache",
            "code": "PGRST205",
            "hint": "Perhaps you meant the table 'public.otp_rate_limits'",
            "details": None,
        }
    )

    verify_update_query = MagicMock()
    verify_update_query.eq.return_value = verify_update_query
    verify_update_query.execute.side_effect = Exception(
        {
            "message": "Could not find the table 'public.otp_verify_rate_limits' in the schema cache",
            "code": "PGRST205",
            "hint": "Perhaps you meant the table 'public.otp_rate_limits'",
            "details": None,
        }
    )

    verify_insert_query = MagicMock()
    verify_insert_query.execute.side_effect = Exception(
        {
            "message": "Could not find the table 'public.otp_verify_rate_limits' in the schema cache",
            "code": "PGRST205",
            "hint": "Perhaps you meant the table 'public.otp_rate_limits'",
            "details": None,
        }
    )

    verify_rate_table.select.return_value = verify_select_query
    verify_rate_table.update.return_value = verify_update_query
    verify_rate_table.insert.return_value = verify_insert_query

    fake_supabase = MagicMock()

    def _table(name: str):
        if name == "otp_codes":
            return otp_table
        if name == "otp_verify_rate_limits":
            return verify_rate_table
        raise AssertionError(f"Unexpected table requested: {name}")

    fake_supabase.table.side_effect = _table
    return fake_supabase


def _build_fake_supabase_with_lost_otp_race(row_id: int = 7):
    otp_table = MagicMock()

    select_query = MagicMock()
    select_query.eq.return_value = select_query
    select_query.gt.return_value = select_query
    select_query.limit.return_value = select_query
    select_query.execute.return_value = SimpleNamespace(data=[{"id": row_id}])

    update_query = MagicMock()
    update_query.eq.return_value = update_query
    update_query.gt.return_value = update_query
    update_query.select.return_value = update_query
    update_query.execute.return_value = SimpleNamespace(data=[])

    otp_table.select.return_value = select_query
    otp_table.update.return_value = update_query

    verify_rate_table = MagicMock()
    verify_select_query = MagicMock()
    verify_select_query.eq.return_value = verify_select_query
    verify_select_query.limit.return_value = verify_select_query
    verify_select_query.execute.return_value = SimpleNamespace(data=[])
    verify_insert_query = MagicMock()
    verify_insert_query.execute.return_value = SimpleNamespace(data=[{"phone": "919876543210"}])
    verify_update_query = MagicMock()
    verify_update_query.eq.return_value = verify_update_query
    verify_update_query.execute.return_value = SimpleNamespace(data=[])
    verify_rate_table.select.return_value = verify_select_query
    verify_rate_table.insert.return_value = verify_insert_query
    verify_rate_table.update.return_value = verify_update_query

    fake_supabase = MagicMock()

    def _table(name: str):
        if name == "otp_codes":
            return otp_table
        if name == "otp_verify_rate_limits":
            return verify_rate_table
        raise AssertionError(f"Unexpected table requested: {name}")

    fake_supabase.table.side_effect = _table
    return fake_supabase


def _build_fake_supabase_for_send():
    otp_table = MagicMock()
    rate_table = MagicMock()

    rate_select_query = MagicMock()
    rate_select_query.eq.return_value = rate_select_query
    rate_select_query.limit.return_value = rate_select_query
    rate_select_query.execute.return_value = SimpleNamespace(data=[])

    rate_insert_query = MagicMock()
    rate_insert_query.execute.return_value = SimpleNamespace(data=[{"phone": "919876543210"}])

    rate_table.select.return_value = rate_select_query
    rate_table.insert.return_value = rate_insert_query

    otp_update_query = MagicMock()
    otp_update_query.eq.return_value = otp_update_query
    otp_update_query.execute.return_value = SimpleNamespace(data=[])

    otp_insert_query = MagicMock()
    otp_insert_query.execute.return_value = SimpleNamespace(data=[{"id": 7}])

    otp_table.update.return_value = otp_update_query
    otp_table.insert.return_value = otp_insert_query

    fake_supabase = MagicMock()

    def _table(name: str):
        if name == "otp_codes":
            return otp_table
        if name == "otp_rate_limits":
            return rate_table
        raise AssertionError(f"Unexpected table requested: {name}")

    fake_supabase.table.side_effect = _table
    return fake_supabase, otp_table, rate_table


class _RecordingBackgroundTasks:
    def __init__(self):
        self.tasks = []

    def add_task(self, func, *args, **kwargs):
        self.tasks.append((func, args, kwargs))


class VerifyOtpTests(unittest.TestCase):
    def test_coerce_utc_datetime_parses_supabase_trimmed_fractional_timestamp(self):
        parsed = auth_router._coerce_utc_datetime("2026-05-27T18:32:10.58782+00:00")

        self.assertEqual(parsed.year, 2026)
        self.assertEqual(parsed.month, 5)
        self.assertEqual(parsed.day, 27)
        self.assertEqual(parsed.hour, 18)
        self.assertEqual(parsed.minute, 32)
        self.assertEqual(parsed.second, 10)
        self.assertEqual(parsed.microsecond, 587820)
        self.assertEqual(parsed.tzinfo, timezone.utc)

    def test_missing_table_matcher_handles_postgrest_string_payload(self):
        exc = Exception(
            "{'message': \"Could not find the table 'public.otp_verify_rate_limits' in the schema cache\", "
            "'code': 'PGRST205', 'hint': \"Perhaps you meant the table 'public.otp_rate_limits'\", 'details': None}"
        )

        self.assertTrue(auth_router._is_missing_table_error(exc, "otp_verify_rate_limits"))

    def test_normalize_phone_matches_frontend_canonical_format(self):
        self.assertEqual(auth_router._normalize_phone("+91 98765-43210"), "919876543210")
        self.assertEqual(auth_router._normalize_phone("09876543210"), "919876543210")

    def test_verify_otp_sends_web_connection_confirmation(self):
        client = _build_client()
        fake_supabase = _build_fake_supabase_for_verify()

        with (
            patch.object(auth_router, "supabase", fake_supabase),
            patch.object(
                auth_router.whatsapp_sender,
                "send_message",
                new=AsyncMock(return_value=True),
            ) as send_message,
        ):
            response = client.post(
                "/auth/verify-otp",
                json={"phone": "9876543210", "code": "123456"},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["valid"])
        self.assertTrue(payload["token"])
        self.assertEqual(payload["phone"], "919876543210")

        send_message.assert_awaited_once()
        args = send_message.await_args.args
        self.assertEqual(args[0], "919876543210")
        self.assertIn("whatsapp", args[1].lower())
        self.assertIn("web", args[1].lower())
        self.assertIn("connected", args[1].lower())

    def test_verify_otp_schedules_login_confirmation_without_awaiting_send(self):
        fake_supabase = _build_fake_supabase_for_verify()
        background_tasks = _RecordingBackgroundTasks()

        with (
            patch.object(auth_router, "supabase", fake_supabase),
            patch.object(
                auth_router.whatsapp_sender,
                "send_message",
                new=AsyncMock(return_value=True),
            ) as send_message,
        ):
            result = asyncio.run(
                auth_router.verify_otp(
                    auth_router.VerifyOTPRequest(phone="9876543210", code="123456"),
                    background_tasks=background_tasks,
                )
            )

        self.assertTrue(result["valid"])
        send_message.assert_not_awaited()
        self.assertEqual(len(background_tasks.tasks), 1)
        task_func, task_args, task_kwargs = background_tasks.tasks[0]
        self.assertIs(task_func, auth_router._send_web_connection_confirmation)
        self.assertEqual(task_args, ("919876543210",))
        self.assertEqual(task_kwargs, {})

    def test_verify_otp_fails_closed_when_verify_rate_limit_table_is_missing(self):
        client = _build_client()
        fake_supabase = _build_fake_supabase_with_missing_verify_rate_table(otp_found=True)

        with (
            patch.object(auth_router, "supabase", fake_supabase),
            patch.object(
                auth_router.whatsapp_sender,
                "send_message",
                new=AsyncMock(return_value=True),
            ),
        ):
            response = client.post(
                "/auth/verify-otp",
                json={"phone": "9876543210", "code": "123456"},
            )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"], "OTP service temporarily unavailable")

    def test_invalid_verify_otp_fails_closed_when_verify_rate_limit_table_is_missing(self):
        client = _build_client()
        fake_supabase = _build_fake_supabase_with_missing_verify_rate_table(otp_found=False)

        with patch.object(auth_router, "supabase", fake_supabase):
            response = client.post(
                "/auth/verify-otp",
                json={"phone": "9876543210", "code": "000000"},
            )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"], "OTP service temporarily unavailable")

    def test_verify_otp_does_not_issue_token_when_atomic_consume_loses_race(self):
        client = _build_client()
        fake_supabase = _build_fake_supabase_with_lost_otp_race()

        with (
            patch.object(auth_router, "supabase", fake_supabase),
            patch.object(
                auth_router.whatsapp_sender,
                "send_message",
                new=AsyncMock(return_value=True),
            ) as send_message,
        ):
            response = client.post(
                "/auth/verify-otp",
                json={"phone": "9876543210", "code": "123456"},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(payload["valid"])
        self.assertEqual(payload["error"], "Invalid or expired OTP")
        self.assertNotIn("token", payload)
        send_message.assert_not_awaited()

    def test_send_otp_scopes_active_code_and_rate_limit_to_purpose(self):
        client = _build_client()
        fake_supabase, otp_table, rate_table = _build_fake_supabase_for_send()

        with (
            patch.object(auth_router, "supabase", fake_supabase),
            patch.object(auth_router.whatsapp_sender, "send_otp_message", new=AsyncMock(return_value=True)),
        ):
            response = client.post(
                "/auth/send-otp",
                json={"phone": "9876543210", "purpose": "digilocker"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"message": "OTP sent"})

        otp_update_query = otp_table.update.return_value
        self.assertIn(("purpose", "digilocker"), [call.args for call in otp_update_query.eq.call_args_list])
        otp_insert_payload = otp_table.insert.call_args.args[0]
        self.assertEqual(otp_insert_payload["phone"], "919876543210")
        self.assertEqual(otp_insert_payload["purpose"], "digilocker")

        rate_select_query = rate_table.select.return_value
        self.assertIn(("purpose", "digilocker"), [call.args for call in rate_select_query.eq.call_args_list])
        rate_insert_payload = rate_table.insert.call_args.args[0]
        self.assertEqual(rate_insert_payload["purpose"], "digilocker")

    def test_verify_otp_uses_purpose_and_skips_login_confirmation_for_digilocker(self):
        client = _build_client()
        fake_supabase = _build_fake_supabase_for_verify()

        with (
            patch.object(auth_router, "supabase", fake_supabase),
            patch.object(
                auth_router.whatsapp_sender,
                "send_message",
                new=AsyncMock(return_value=True),
            ) as send_message,
        ):
            response = client.post(
                "/auth/verify-otp",
                json={"phone": "9876543210", "code": "123456", "purpose": "digilocker"},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["valid"])
        self.assertEqual(payload["phone"], "919876543210")
        self.assertEqual(payload["purpose"], "digilocker")

        update_query = fake_supabase.table.return_value.update.return_value
        self.assertIn(("purpose", "digilocker"), [call.args for call in update_query.eq.call_args_list])
        send_message.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
