import logging

from fastapi import APIRouter, HTTPException
from gov_agent.db import supabase

logger = logging.getLogger(__name__)

router = APIRouter()


def _load_latest_application_for_phone_portal(phone: str, portal: str) -> dict | None:
    latest = (
        supabase.table("applications")
        .select("confirmation_number, phone, portal, submitted_at")
        .eq("phone", phone)
        .eq("portal", portal)
        .order("submitted_at", desc=True)
        .limit(1)
        .execute()
    )
    return latest.data[0] if latest.data else None


@router.get("/{confirmation_number}/timeline")
async def get_timeline(confirmation_number: str):
    try:
        resp = (
            supabase.table("applications")
            .select("confirmation_number, service, status, submitted_at, timeline_steps, portal, phone")
            .eq("confirmation_number", confirmation_number)
            .execute()
        )
        if not resp.data:
            raise HTTPException(status_code=404, detail="Application not found")

        row = resp.data[0]
        latest_row = _load_latest_application_for_phone_portal(
            str(row.get("phone") or ""),
            str(row.get("portal") or "nsp"),
        )
    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        logger.error("DB error fetching timeline: %s", e)
        raise HTTPException(status_code=500, detail="DB error")

    if latest_row and latest_row.get("confirmation_number") != row.get("confirmation_number"):
        raise HTTPException(status_code=404, detail="Application not found")

    steps = row.get("timeline_steps") or []
    return {
        "confirmation_number": row.get("confirmation_number"),
        "service": row.get("service"),
        "status": row.get("status"),
        "portal": row.get("portal", "nsp"),
        "submitted_at": row.get("submitted_at"),
        "timeline_steps": steps,
        "steps": steps,
    }
