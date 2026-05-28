"""
Authentication router for GovBot.

Provides OTP-based phone authentication over WhatsApp:
  POST /auth/send-otp   — generate & deliver a 6-digit OTP via WhatsApp
  POST /auth/verify-otp — validate the OTP and return a signed JWT
"""

import hashlib
import ast
import logging
import re
import secrets
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from gov_agent.db import supabase
from gov_agent.user_auth import normalize_phone
from gov_agent import whatsapp_sender
from gov_agent.official_auth import issue_official_token, validate_official_credentials
from gov_agent.web_session import consume_login_handoff, issue_citizen_token

logger = logging.getLogger(__name__)

router = APIRouter()

# ── OTP rate-limit config ────────────────────────────────────────────────────
_OTP_WINDOW_MINUTES = 10
_OTP_MAX_REQUESTS = 3
_OTP_MAX_VERIFY_ATTEMPTS = 5
_OTP_TTL_MINUTES = 10
_MISSING_RATE_LIMIT_TABLE = object()
_OTP_PURPOSE_LOGIN = "login"
_ALLOWED_OTP_PURPOSES = frozenset({_OTP_PURPOSE_LOGIN, "digilocker", "bank_verify"})


def _normalize_otp_purpose(purpose: str | None) -> str:
    normalized = str(purpose or _OTP_PURPOSE_LOGIN).strip().lower().replace("-", "_")
    if normalized not in _ALLOWED_OTP_PURPOSES:
        raise HTTPException(status_code=400, detail="Unsupported OTP purpose")
    return normalized


def _coerce_utc_datetime(value: str | None) -> datetime:
    raw_value = str(value or "").strip()
    if not raw_value:
        return datetime.now(timezone.utc)
    normalized = raw_value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        match = re.fullmatch(
            r"(?P<base>\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})"
            r"(?:\.(?P<fraction>\d+))?"
            r"(?P<tz>[+-]\d{2}:\d{2}|[+-]\d{4})?$",
            normalized,
        )
        if not match:
            return datetime.now(timezone.utc)
        tz = match.group("tz") or ""
        if tz and len(tz) == 5:
            tz = f"{tz[:3]}:{tz[3:]}"
        fraction = match.group("fraction")
        if fraction:
            fraction = f"{fraction[:6]:0<6}"
            normalized = f"{match.group('base')}.{fraction}{tz}"
        else:
            normalized = f"{match.group('base')}{tz}"
        try:
            parsed = datetime.fromisoformat(normalized)
        except ValueError:
            return datetime.now(timezone.utc)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def _is_missing_table_error(exc: Exception, table_name: str) -> bool:
    payload = exc.args[0] if exc.args else None
    message = str(exc)
    code = getattr(exc, "code", None)
    if isinstance(payload, dict):
        code = payload.get("code") or code
        message = str(payload.get("message") or message)
    elif isinstance(payload, str):
        try:
            parsed = ast.literal_eval(payload)
        except (SyntaxError, ValueError):
            parsed = None
        if isinstance(parsed, dict):
            code = parsed.get("code") or code
            message = str(parsed.get("message") or message)
    else:
        message = str(exc)
    return code == "PGRST205" and f"public.{table_name}" in message


def _skip_missing_rate_limit_table(exc: Exception, table_name: str, phone: str) -> bool:
    if not _is_missing_table_error(exc, table_name):
        return False
    logger.warning("OTP rate-limit table %s is missing; skipping enforcement for %s", table_name, phone)
    return True


def _load_rate_limit_row(
    table_name: str,
    phone: str,
    purpose: str,
    *,
    fail_open_missing_table: bool = False,
) -> dict | object | None:
    try:
        result = (
            supabase.table(table_name)
            .select("request_count, window_start")
            .eq("phone", phone)
            .eq("purpose", purpose)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        if fail_open_missing_table and _skip_missing_rate_limit_table(exc, table_name, phone):
            return _MISSING_RATE_LIMIT_TABLE
        logger.error("OTP rate-limit storage failed for %s on %s: %s", table_name, phone, exc)
        raise HTTPException(status_code=503, detail="OTP service temporarily unavailable") from exc

    if not result.data:
        return None
    return result.data[0]


def _check_rate_limit(phone: str, purpose: str) -> None:
    """Raise HTTP 429 if phone has exceeded OTP request quota.

    State is stored in the Supabase `otp_rate_limits` table so the limit is
    enforced consistently across all workers and survives restarts.
    """
    now = datetime.now(timezone.utc)
    window_cutoff = now - timedelta(minutes=_OTP_WINDOW_MINUTES)
    row = _load_rate_limit_row("otp_rate_limits", phone, purpose)

    try:
        if not row:
            supabase.table("otp_rate_limits").insert({
                "phone": phone,
                "purpose": purpose,
                "request_count": 1,
                "window_start": now.isoformat(),
            }).execute()
            return

        window_start = _coerce_utc_datetime(row.get("window_start"))
        count = int(row.get("request_count") or 0)

        if window_start < window_cutoff:
            supabase.table("otp_rate_limits").update({
                "request_count": 1,
                "window_start": now.isoformat(),
            }).eq("phone", phone).eq("purpose", purpose).execute()
            return

        if count >= _OTP_MAX_REQUESTS:
            raise HTTPException(
                status_code=429,
                detail=f"Too many OTP requests. Try again in {_OTP_WINDOW_MINUTES} minutes.",
            )

        supabase.table("otp_rate_limits").update({
            "request_count": count + 1,
        }).eq("phone", phone).eq("purpose", purpose).execute()
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("OTP request rate-limit update failed for %s: %s", phone, exc)
        raise HTTPException(status_code=503, detail="OTP service temporarily unavailable") from exc


def _check_verify_rate_limit(phone: str, purpose: str) -> None:
    now = datetime.now(timezone.utc)
    window_cutoff = now - timedelta(minutes=_OTP_WINDOW_MINUTES)
    row = _load_rate_limit_row(
        "otp_verify_rate_limits",
        phone,
        purpose,
    )
    if row is _MISSING_RATE_LIMIT_TABLE or not row:
        return

    window_start = _coerce_utc_datetime(row.get("window_start"))
    count = int(row.get("request_count") or 0)

    if window_start < window_cutoff:
        try:
            supabase.table("otp_verify_rate_limits").update({
                "request_count": 0,
                "window_start": now.isoformat(),
            }).eq("phone", phone).eq("purpose", purpose).execute()
        except Exception as exc:
            if _skip_missing_rate_limit_table(exc, "otp_verify_rate_limits", phone):
                return
            logger.error("OTP verify rate-limit reset failed for %s: %s", phone, exc)
            raise HTTPException(status_code=503, detail="OTP service temporarily unavailable") from exc
        return

    if count >= _OTP_MAX_VERIFY_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail=f"Too many OTP verification attempts. Try again in {_OTP_WINDOW_MINUTES} minutes.",
        )


def _record_verify_failure(phone: str, purpose: str) -> None:
    now = datetime.now(timezone.utc)
    window_cutoff = now - timedelta(minutes=_OTP_WINDOW_MINUTES)
    row = _load_rate_limit_row(
        "otp_verify_rate_limits",
        phone,
        purpose,
    )
    if row is _MISSING_RATE_LIMIT_TABLE:
        return

    try:
        if not row:
            supabase.table("otp_verify_rate_limits").insert({
                "phone": phone,
                "purpose": purpose,
                "request_count": 1,
                "window_start": now.isoformat(),
            }).execute()
            return

        window_start = _coerce_utc_datetime(row.get("window_start"))
        count = int(row.get("request_count") or 0)
        next_count = 1 if window_start < window_cutoff else count + 1
        supabase.table("otp_verify_rate_limits").update({
            "request_count": next_count,
            "window_start": now.isoformat() if window_start < window_cutoff else row.get("window_start"),
        }).eq("phone", phone).eq("purpose", purpose).execute()
    except Exception as exc:
        if _skip_missing_rate_limit_table(exc, "otp_verify_rate_limits", phone):
            return
        logger.error("OTP verify failure rate-limit update failed for %s: %s", phone, exc)
        raise HTTPException(status_code=503, detail="OTP service temporarily unavailable") from exc


def _clear_verify_failures(phone: str, purpose: str) -> None:
    try:
        supabase.table("otp_verify_rate_limits").update({
            "request_count": 0,
            "window_start": datetime.now(timezone.utc).isoformat(),
        }).eq("phone", phone).eq("purpose", purpose).execute()
    except Exception as exc:
        if _skip_missing_rate_limit_table(exc, "otp_verify_rate_limits", phone):
            return
        logger.error("OTP verify rate-limit clear failed for %s: %s", phone, exc)
        raise HTTPException(status_code=503, detail="OTP service temporarily unavailable") from exc


def _consume_valid_otp(phone: str, code: str, purpose: str, now_iso: str) -> bool:
    result = (
        supabase.table("otp_codes")
        .update({"used": True})
        .eq("phone", phone)
        .eq("purpose", purpose)
        .eq("code", _hash_otp(code))
        .eq("used", False)
        .gt("expires_at", now_iso)
        .select("id")
        .execute()
    )
    return bool(result.data)


def _hash_otp(code: str) -> str:
    """Return SHA-256 hex digest of the OTP code."""
    return hashlib.sha256(code.encode()).hexdigest()


def _normalize_phone(phone: str) -> str:
    return normalize_phone(phone)


# ── Request schemas ──────────────────────────────────────────────────────────

class SendOTPRequest(BaseModel):
    phone: str | None = None
    purpose: str | None = None


class VerifyOTPRequest(BaseModel):
    phone: str | None = None
    code: str | None = None
    purpose: str | None = None


class ExchangeHandoffRequest(BaseModel):
    code: str | None = None


class OfficialLoginRequest(BaseModel):
    username: str | None = None
    password: str | None = None


async def _send_web_connection_confirmation(phone: str) -> None:
    message = (
        "✅ Your GovBot WhatsApp and web login are now connected.\n"
        "You can continue on the dashboard and come back to WhatsApp anytime."
    )
    try:
        delivered = await whatsapp_sender.send_message(phone, message)
        if not delivered:
            logger.warning("Web connection confirmation was not delivered to %s", phone)
    except Exception as exc:
        logger.warning("Failed to send web connection confirmation to %s: %s", phone, exc)


# ── POST /send-otp ───────────────────────────────────────────────────────────

@router.post("/send-otp")
async def send_otp(body: SendOTPRequest):
    """Generate a 6-digit OTP, persist it, and send via WhatsApp."""
    if not body.phone:
        raise HTTPException(status_code=400, detail="phone is required")

    phone = _normalize_phone(body.phone)
    purpose = _normalize_otp_purpose(body.purpose)
    _check_rate_limit(phone, purpose)

    code = f"{secrets.randbelow(900_000) + 100_000:06d}"
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=_OTP_TTL_MINUTES)

    try:
        (
            supabase.table("otp_codes")
            .update({"used": True})
            .eq("phone", phone)
            .eq("purpose", purpose)
            .eq("used", False)
            .execute()
        )
        supabase.table("otp_codes").insert({
            "phone": phone,
            "purpose": purpose,
            "code": _hash_otp(code),
            "expires_at": expires_at.isoformat(),
            "used": False,
        }).execute()
    except Exception as e:
        logger.error("Failed to store OTP for %s: %s", phone, e)
        raise HTTPException(status_code=500, detail="Failed to store OTP") from e

    # Deliver OTP over WhatsApp using a business-initiated template when configured.
    delivered = await whatsapp_sender.send_otp_message(phone, code, validity_minutes=10)
    if not delivered:
        logger.error("Failed to deliver OTP to %s", phone)
        raise HTTPException(status_code=502, detail="Failed to send OTP via WhatsApp or SMS")

    logger.info("OTP sent to %s", phone)
    return {"message": "OTP sent"}


# ── POST /verify-otp ─────────────────────────────────────────────────────────

@router.post("/verify-otp")
async def verify_otp(body: VerifyOTPRequest):
    """Validate an OTP and return a signed JWT on success."""
    if not body.phone or not body.code:
        raise HTTPException(status_code=400, detail="phone and code are required")

    phone = _normalize_phone(body.phone)
    purpose = _normalize_otp_purpose(body.purpose)
    now_iso = datetime.now(timezone.utc).isoformat()
    _check_verify_rate_limit(phone, purpose)

    # Atomically consume the valid OTP row. A concurrent replay only succeeds
    # for the request that updates the unused row first.
    if not _consume_valid_otp(phone, body.code, purpose, now_iso):
        _record_verify_failure(phone, purpose)
        return {"valid": False, "error": "Invalid or expired OTP"}

    # Mark all active OTPs for this phone and purpose as consumed so older codes cannot be replayed.
    (
        supabase.table("otp_codes")
        .update({"used": True})
        .eq("phone", phone)
        .eq("purpose", purpose)
        .eq("used", False)
        .execute()
    )
    _clear_verify_failures(phone, purpose)

    token = issue_citizen_token(phone)

    logger.info("JWT issued for %s", phone)
    if purpose == _OTP_PURPOSE_LOGIN:
        await _send_web_connection_confirmation(phone)
    return {"valid": True, "token": token, "phone": phone, "purpose": purpose}


@router.post("/exchange-handoff")
async def exchange_handoff(body: ExchangeHandoffRequest):
    session = consume_login_handoff(body.code or "")
    return {
        "valid": True,
        "phone": session["phone"],
        "next_path": session["next_path"],
        "token": session["token"],
    }


@router.post("/official/login")
async def official_login(body: OfficialLoginRequest):
    if not body.username or not body.password:
        raise HTTPException(status_code=400, detail="username and password are required")

    validate_official_credentials(body.username, body.password)
    token = issue_official_token(body.username)

    logger.info("Official JWT issued for %s", body.username)
    return {"token": token, "username": body.username.strip(), "role": "official"}
