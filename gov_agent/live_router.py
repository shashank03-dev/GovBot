import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from gov_agent.db import supabase
from gov_agent.user_auth import optional_jwt as _optional_jwt
from gov_agent.user_auth import require_authenticated_phone, require_phone_access

logger = logging.getLogger(__name__)

router = APIRouter()


class LiveUpdateRequest(BaseModel):
    step: int
    form_state: dict
    status: Optional[str] = "in_progress"


def _load_live_session_row(session_id: str) -> dict:
    try:
        resp = (
            supabase.table("live_sessions")
            .select("*")
            .eq("session_id", session_id)
            .limit(1)
            .execute()
        )
    except Exception as e:
        logger.error("live_sessions fetch failed: %s", e)
        raise HTTPException(status_code=500, detail="DB error")

    if not resp.data:
        raise HTTPException(status_code=404, detail="Session not found")

    return resp.data[0]


@router.get("/{session_id}")
async def get_live_session(
    session_id: str,
    token_phone: Optional[str] = Depends(_optional_jwt),
):
    session = _load_live_session_row(session_id)
    require_phone_access(str(session.get("phone") or ""), require_authenticated_phone(token_phone))
    return session


@router.post("/{session_id}/update")
async def update_live_session(
    session_id: str,
    body: LiveUpdateRequest,
    token_phone: Optional[str] = Depends(_optional_jwt),
):
    session = _load_live_session_row(session_id)
    require_phone_access(str(session.get("phone") or ""), require_authenticated_phone(token_phone))

    try:
        supabase.table("live_sessions").update({
            "step": body.step,
            "form_state": body.form_state,
            "status": body.status,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("session_id", session_id).execute()
    except Exception as e:
        logger.error("live_sessions update failed: %s", e)
        raise HTTPException(status_code=500, detail="DB update error")

    return {"ok": True}


async def create_live_session(session_id: str, phone: str, portal: str = "nsp") -> bool:
    """Helper called from flow_router when an application flow starts."""
    try:
        supabase.table("live_sessions").insert({
            "session_id": session_id,
            "phone": phone,
            "portal": portal,
            "step": 1,
            "total_steps": 5,
            "form_state": {},
            "status": "in_progress",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
        return True
    except Exception as e:
        logger.warning("Failed to create live_session: %s", e)
        return False


async def advance_live_session(session_id: str, step: int, form_state: dict, status: str = "in_progress"):
    """Helper to push step/state updates from flow_router."""
    try:
        supabase.table("live_sessions").update({
            "step": step,
            "form_state": form_state,
            "status": status,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("session_id", session_id).execute()
    except Exception as e:
        logger.warning("advance_live_session failed: %s", e)


class ActivityEvent(BaseModel):
    phone: str
    event: str


def _build_dashboard_summary(applications: list[dict]) -> dict[str, int]:
    return {
        "total": len(applications),
        "submitted": sum(1 for app in applications if app.get("status") == "submitted"),
        "pending": sum(1 for app in applications if app.get("status") == "pending"),
        "failed": sum(1 for app in applications if app.get("status") == "failed"),
    }


@router.get("/dashboard/{phone}")
async def get_dashboard_snapshot(phone: str, token_phone: Optional[str] = Depends(_optional_jwt)):
    phone = require_phone_access(phone, token_phone)

    try:
        applications_resp = (
            supabase.table("applications")
            .select("id, service, status, confirmation_number, submitted_at")
            .eq("phone", phone)
            .order("submitted_at", desc=True)
            .execute()
        )
        applications = applications_resp.data or []

        activity_resp = (
            supabase.table("activity_feed")
            .select("event, created_at")
            .eq("phone", phone)
            .order("created_at", desc=True)
            .limit(20)
            .execute()
        )
        activities = [
            {"event": row["event"], "timestamp": row["created_at"]}
            for row in reversed(activity_resp.data or [])
        ]

        return {
            "summary": _build_dashboard_summary(applications),
            "applications": applications,
            "activities": activities,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.warning("dashboard snapshot fetch failed: %s", e)
        raise HTTPException(status_code=500, detail="Failed to fetch dashboard snapshot")


@router.post("/event")
async def post_activity_event(
    body: ActivityEvent,
    token_phone: Optional[str] = Depends(_optional_jwt),
):
    phone = require_phone_access(body.phone, token_phone)
    try:
        supabase.table("activity_feed").insert({
            "phone": phone,
            "event": body.event,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as e:
        logger.warning("activity_feed insert failed: %s", e)
    return {"ok": True}


@router.get("/feed/{phone}")
async def get_activity_feed(phone: str, token_phone: Optional[str] = Depends(_optional_jwt)):
    phone = require_phone_access(phone, token_phone)
    try:
        resp = supabase.table("activity_feed").select("*").eq(
            "phone", phone
        ).order("created_at", desc=True).limit(20).execute()
        events = [
            {"event": r["event"], "timestamp": r["created_at"]}
            for r in (resp.data or [])
        ]
        return {"events": list(reversed(events))}
    except Exception as e:
        logger.warning("activity_feed fetch failed: %s", e)
        return {"events": []}
