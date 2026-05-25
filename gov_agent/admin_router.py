import logging

from fastapi import APIRouter, Depends, HTTPException

from gov_agent.db import supabase
from gov_agent.official_auth import require_official_auth

logger = logging.getLogger(__name__)
router = APIRouter(dependencies=[Depends(require_official_auth)])


@router.get("/admin/dashboard")
async def get_admin_dashboard():
    try:
        applications_result = (
            supabase.table("applications")
            .select("*")
            .order("submitted_at", desc=True)
            .limit(100)
            .execute()
        )
        fraud_result = (
            supabase.table("fraud_flags")
            .select("*")
            .order("flagged_at", desc=True)
            .limit(100)
            .execute()
        )

        return {
            "applications": applications_result.data or [],
            "fraud_flags": fraud_result.data or [],
        }
    except Exception as exc:
        logger.error("Admin dashboard fetch failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to fetch admin dashboard") from exc


@router.delete("/admin/fraud-flags/{flag_id}")
async def clear_admin_fraud_flag(flag_id: str):
    try:
        supabase.table("fraud_flags").delete().eq("id", flag_id).execute()
        return {"cleared": True, "id": flag_id}
    except Exception as exc:
        logger.error("Fraud flag clear failed for %s: %s", flag_id, exc)
        raise HTTPException(status_code=500, detail="Failed to clear fraud flag") from exc
