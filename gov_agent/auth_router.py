"""
Authentication router for GovBot.

Provides OTP-based phone authentication over WhatsApp:
  POST /auth/send-otp   — generate & deliver a 6-digit OTP via WhatsApp
  POST /auth/verify-otp — validate the OTP and return a signed JWT
"""

import hashlib
import random
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from jose import jwt

from gov_agent.config import SECRET_KEY
from gov_agent.db import supabase
from gov_agent import whatsapp_sender
from gov_agent.official_auth import issue_official_token, validate_official_credentials

logger = logging.getLogger(__name__)

router = APIRouter()

# ── OTP rate-limit config ────────────────────────────────────────────────────
_OTP_WINDOW_MINUTES = 10
_OTP_MAX_REQUESTS = 3


def _check_rate_limit(phone: str) -> None:
    """Raise HTTP 429 if phone has exceeded OTP request quota.

    State is stored in the Supabase `otp_rate_limits` table so the limit is
    enforced consistently across all workers and survives restarts.
    """
    try:
        now = datetime.now(timezone.utc)
        window_cutoff = now - timedelta(minutes=_OTP_WINDOW_MINUTES)

        result = (
            supabase.table("otp_rate_limits")
            .select("request_count, window_start")
            .eq("phone", phone)
            .limit(1)
            .execute()
        )

        if not result.data:
            # First request from this phone — create row
            supabase.table("otp_rate_limits").insert({
                "phone": phone,
                "request_count": 1,
                "window_start": now.isoformat(),
            }).execute()
            return

        row = result.data[0]
        window_start = datetime.fromisoformat(row["window_start"])
        if window_start.tzinfo is None:
            window_start = window_start.replace(tzinfo=timezone.utc)
        count = row["request_count"]

        if window_start < window_cutoff:
            # Window expired — reset counter
            supabase.table("otp_rate_limits").update({
                "request_count": 1,
                "window_start": now.isoformat(),
            }).eq("phone", phone).execute()
            return

        if count >= _OTP_MAX_REQUESTS:
            raise HTTPException(
                status_code=429,
                detail=f"Too many OTP requests. Try again in {_OTP_WINDOW_MINUTES} minutes.",
            )

        supabase.table("otp_rate_limits").update({
            "request_count": count + 1,
        }).eq("phone", phone).execute()
    except HTTPException:
        raise
    except Exception as e:
        # If otp_rate_limits table doesn't exist or other error, log and continue without rate limiting
        logger.warning("Rate limiting disabled due to missing table or error: %s", e)
        return


def _hash_otp(code: str) -> str:
    """Return SHA-256 hex digest of the OTP code."""
    return hashlib.sha256(code.encode()).hexdigest()


def _normalize_phone(phone: str) -> str:
    phone = phone.strip().removeprefix("+")
    # Prepend India country code for bare 10-digit numbers
    if len(phone) == 10 and phone.isdigit():
        phone = "91" + phone
    return phone


# ── Request schemas ──────────────────────────────────────────────────────────

class SendOTPRequest(BaseModel):
    phone: str | None = None


class VerifyOTPRequest(BaseModel):
    phone: str | None = None
    code: str | None = None


class OfficialLoginRequest(BaseModel):
    username: str | None = None
    password: str | None = None


# ── POST /send-otp ───────────────────────────────────────────────────────────

@router.post("/send-otp")
async def send_otp(body: SendOTPRequest):
    """Generate a 6-digit OTP, persist it, and send via WhatsApp."""
    if not body.phone:
        raise HTTPException(status_code=400, detail="phone is required")

    phone = _normalize_phone(body.phone)
    _check_rate_limit(phone)

    code = str(random.randint(100_000, 999_999))
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=10)

    try:
        supabase.table("otp_codes").insert({
            "phone": phone,
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
    now_iso = datetime.now(timezone.utc).isoformat()

    # Fetch a valid, unused, non-expired OTP row (compare hashed code)
    result = (
        supabase.table("otp_codes")
        .select("id")
        .eq("phone", phone)
        .eq("code", _hash_otp(body.code))
        .eq("used", False)
        .gt("expires_at", now_iso)
        .limit(1)
        .execute()
    )

    if not result.data:
        return {"valid": False, "error": "Invalid or expired OTP"}

    # Mark the OTP as consumed
    row_id = result.data[0]["id"]
    supabase.table("otp_codes").update({"used": True}).eq("id", row_id).execute()

    # Issue a 7-day JWT
    exp = datetime.now(timezone.utc) + timedelta(days=7)
    payload = {"phone": phone, "sub": phone, "exp": exp}
    token = jwt.encode(payload, str(SECRET_KEY), algorithm="HS256")

    logger.info("JWT issued for %s", phone)
    return {"valid": True, "token": token, "phone": phone}


@router.post("/official/login")
async def official_login(body: OfficialLoginRequest):
    if not body.username or not body.password:
        raise HTTPException(status_code=400, detail="username and password are required")

    validate_official_credentials(body.username, body.password)
    token = issue_official_token(body.username)

    logger.info("Official JWT issued for %s", body.username)
    return {"token": token, "username": body.username.strip(), "role": "official"}
