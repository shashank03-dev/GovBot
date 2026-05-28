import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from fastapi import HTTPException
from jose import jwt

from gov_agent.config import FRONTEND_URL, SECRET_KEY
from gov_agent.db import supabase
from gov_agent.user_auth import normalize_phone

_LOGIN_HANDOFF_TTL_MINUTES = 10
_CITIZEN_SESSION_TTL_DAYS = 7


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _sanitize_next_path(next_path: str | None) -> str:
    if not next_path or not next_path.startswith("/") or next_path.startswith("//"):
        return "/dashboard"
    return next_path


def _dashboard_next_path(phone: str, next_path: str | None) -> str:
    safe_path = _sanitize_next_path(next_path)
    if safe_path == "/dashboard":
        return f"/dashboard?phone={quote(str(phone), safe='')}"
    return safe_path


def issue_citizen_token(phone: str) -> str:
    normalized_phone = normalize_phone(phone)
    if not normalized_phone:
        raise HTTPException(status_code=400, detail="phone is required")

    expires_at = _utcnow() + timedelta(days=_CITIZEN_SESSION_TTL_DAYS)
    payload = {"phone": normalized_phone, "sub": normalized_phone, "exp": expires_at}
    return jwt.encode(payload, str(SECRET_KEY), algorithm="HS256")


def create_login_handoff(phone: str, next_path: str = "/dashboard") -> str:
    normalized_phone = normalize_phone(phone)
    if not normalized_phone:
        raise HTTPException(status_code=400, detail="phone is required")

    handoff_code = secrets.token_urlsafe(24)
    expires_at = _utcnow() + timedelta(minutes=_LOGIN_HANDOFF_TTL_MINUTES)
    safe_next_path = _dashboard_next_path(normalized_phone, next_path)

    try:
        supabase.table("login_handoffs").update({"used": True}).eq("phone", normalized_phone).eq("used", False).execute()
        supabase.table("login_handoffs").insert(
            {
                "phone": normalized_phone,
                "code_hash": _hash_secret(handoff_code),
                "next_path": safe_next_path,
                "expires_at": expires_at.isoformat(),
                "used": False,
                "created_at": _utcnow().isoformat(),
            }
        ).execute()
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Could not start secure web login") from exc

    return handoff_code


def consume_login_handoff(code: str) -> dict[str, str]:
    normalized_code = str(code or "").strip()
    if not normalized_code:
        raise HTTPException(status_code=400, detail="code is required")

    try:
        result = (
            supabase.table("login_handoffs")
            .select("id, phone, next_path, expires_at, used")
            .eq("code_hash", _hash_secret(normalized_code))
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Could not verify secure web login") from exc

    if not result.data:
        raise HTTPException(status_code=401, detail="Invalid or expired login link")

    record = result.data[0]
    expires_at = datetime.fromisoformat(str(record["expires_at"]))
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if record.get("used") or expires_at <= _utcnow():
        raise HTTPException(status_code=401, detail="Invalid or expired login link")

    try:
        supabase.table("login_handoffs").update(
            {
                "used": True,
                "used_at": _utcnow().isoformat(),
            }
        ).eq("id", record["id"]).execute()
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Could not finalize secure web login") from exc

    phone = normalize_phone(record.get("phone"))
    return {
        "phone": phone,
        "next_path": _sanitize_next_path(record.get("next_path")),
        "token": issue_citizen_token(phone),
    }


def build_handoff_login_url(phone: str, next_path: str = "/dashboard") -> str:
    handoff_code = create_login_handoff(phone, next_path)
    return f"{FRONTEND_URL}/login?handoff={quote(handoff_code, safe='')}"
