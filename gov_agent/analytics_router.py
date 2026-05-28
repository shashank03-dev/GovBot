"""
Government Analytics Router — Dashboard Data APIs

Provides aggregated data for government officials:
- Application statistics
- Fraud detection metrics
- Disbursement tracking
- Regional analytics
"""

import logging
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from gov_agent.application_store import latest_applications_by_phone_portal
from gov_agent.db import supabase
from gov_agent.official_auth import require_official_auth

logger = logging.getLogger(__name__)
router = APIRouter(dependencies=[Depends(require_official_auth)])


class DateRangeRequest(BaseModel):
    start_date: str | None = None  # ISO format
    end_date: str | None = None


def _get_default_date_range(days: int = 30) -> tuple[str, str]:
    """Get default date range (last N days)."""
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    return start.isoformat(), end.isoformat()


@router.get("/analytics/overview")
async def get_analytics_overview():
    """Get high-level dashboard metrics."""
    
    try:
        apps_result = (
            supabase.table("applications")
            .select("phone, portal, status, submitted_at")
            .order("submitted_at", desc=True)
            .execute()
        )
        applications = latest_applications_by_phone_portal(apps_result.data or [])
        total_applications = len(applications)
        
        status_counts = {}
        for status in ["submitted", "approved", "rejected", "processing"]:
            status_counts[status] = sum(1 for app in applications if app.get("status") == status)
        
        # Total credentials issued
        creds_result = supabase.table("verifiable_credentials").select("*", count="exact").execute()
        total_credentials = creds_result.count or 0
        
        # Total disbursements
        disburse_result = (
            supabase.table("disbursement_tracking")
            .select("amount")
            .eq("status", "credited")
            .execute()
        )
        total_disbursed = sum(d.get("amount", 0) for d in (disburse_result.data or []))
        
        # Bank verifications
        bank_result = supabase.table("bank_verifications").select("*", count="exact").eq("verified", True).execute()
        verified_banks = bank_result.count or 0
        
        # Fraud flags
        fraud_result = supabase.table("fraud_flags").select("*", count="exact").execute()
        fraud_flags = fraud_result.count or 0
        
        # Today's applications
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        today_applications = sum(
            1 for app in applications if str(app.get("submitted_at") or "") >= today_start
        )
        
        return {
            "total_applications": total_applications,
            "status_breakdown": status_counts,
            "total_credentials_issued": total_credentials,
            "total_disbursed_inr": total_disbursed,
            "verified_bank_accounts": verified_banks,
            "fraud_flags": fraud_flags,
            "today_applications": today_applications,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        
    except Exception as e:
        logger.error(f"Analytics overview error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch analytics")


@router.get("/analytics/applications/timeline")
async def get_application_timeline(days: int = 30):
    """Get daily application counts for the last N days."""
    
    try:
        start_date = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        
        result = (
            supabase.table("applications")
            .select("phone, portal, submitted_at, status")
            .gte("submitted_at", start_date)
            .order("submitted_at", desc=True)
            .execute()
        )
        applications = latest_applications_by_phone_portal(result.data or [])
        
        # Group by date
        timeline = {}
        for app in applications:
            date = app["submitted_at"][:10]  # YYYY-MM-DD
            if date not in timeline:
                timeline[date] = {"total": 0, "approved": 0, "rejected": 0, "pending": 0}
            
            timeline[date]["total"] += 1
            status = app.get("status", "submitted")
            if status == "approved":
                timeline[date]["approved"] += 1
            elif status == "rejected":
                timeline[date]["rejected"] += 1
            else:
                timeline[date]["pending"] += 1
        
        # Convert to sorted list
        sorted_timeline = [
            {"date": date, **counts}
            for date, counts in sorted(timeline.items())
        ]
        
        return {
            "days": days,
            "timeline": sorted_timeline,
        }
        
    except Exception as e:
        logger.error(f"Timeline error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch timeline")


@router.get("/analytics/fraud/summary")
async def get_fraud_summary():
    """Get fraud detection summary."""
    
    try:
        # Total fraud flags
        total_result = supabase.table("fraud_flags").select("*", count="exact").execute()
        total_flags = total_result.count or 0
        
        # Recent flags (last 7 days)
        week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        recent_result = (
            supabase.table("fraud_flags")
            .select("*", count="exact")
            .gte("flagged_at", week_ago)
            .execute()
        )
        recent_flags = recent_result.count or 0
        
        # Get all flags with details
        flags_result = (
            supabase.table("fraud_flags")
            .select("*")
            .order("flagged_at", desc=True)
            .limit(50)
            .execute()
        )
        
        # Unique fraudsters (by Aadhaar hash)
        unique_hashes = set()
        for flag in (flags_result.data or []):
            unique_hashes.add(flag.get("aadhaar_hash"))
        
        return {
            "total_flags": total_flags,
            "recent_flags_7d": recent_flags,
            "unique_fraudsters": len(unique_hashes),
            "recent_flags": flags_result.data or [],
        }
        
    except Exception as e:
        logger.error(f"Fraud summary error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch fraud data")


@router.get("/analytics/disbursements/summary")
async def get_disbursement_summary():
    """Get scholarship disbursement summary."""
    
    try:
        # By status
        status_counts = {}
        for status in ["pending", "processing", "credited", "failed"]:
            result = (
                supabase.table("disbursement_tracking")
                .select("*", count="exact")
                .eq("status", status)
                .execute()
            )
            status_counts[status] = result.count or 0
        
        # Total amounts
        pending_result = (
            supabase.table("disbursement_tracking")
            .select("amount")
            .eq("status", "pending")
            .execute()
        )
        pending_amount = sum(d.get("amount", 0) for d in (pending_result.data or []))
        
        credited_result = (
            supabase.table("disbursement_tracking")
            .select("amount")
            .eq("status", "credited")
            .execute()
        )
        credited_amount = sum(d.get("amount", 0) for d in (credited_result.data or []))
        
        # Recent disbursements
        recent_result = (
            supabase.table("disbursement_tracking")
            .select("*, applications(confirmation_number)")
            .order("created_at", desc=True)
            .limit(20)
            .execute()
        )
        
        return {
            "status_counts": status_counts,
            "pending_amount_inr": pending_amount,
            "credited_amount_inr": credited_amount,
            "recent_disbursements": recent_result.data or [],
        }
        
    except Exception as e:
        logger.error(f"Disbursement summary error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch disbursement data")


@router.get("/analytics/regional")
async def get_regional_analytics():
    """Get regional/state-wise analytics."""
    
    try:
        # Get all applications with session data (contains location info if collected)
        # For demo, we'll use phone area codes or mock regional data
        
        apps_result = (
            supabase.table("applications")
            .select("phone, portal, status, submitted_at")
            .order("submitted_at", desc=True)
            .execute()
        )
        applications = latest_applications_by_phone_portal(apps_result.data or [])

        portal_counts = {}
        for portal in ["nsp", "ssp", "csss", "minority"]:
            portal_rows = [app for app in applications if app.get("portal") == portal]
            portal_counts[portal] = {
                "count": len(portal_rows),
                "name": {
                    "nsp": "National Scholarship",
                    "ssp": "State Scholarship Portal",
                    "csss": "Central Sector",
                    "minority": "Minority Scholarship",
                }.get(portal, portal.upper()),
            }
        
        # By status for each portal
        for portal in portal_counts:
            portal_rows = [app for app in applications if app.get("portal") == portal]
            for status in ["submitted", "approved", "rejected"]:
                portal_counts[portal][status] = sum(1 for app in portal_rows if app.get("status") == status)
        
        return {
            "by_portal": portal_counts,
            "note": "State-wise breakdown requires location data collection",
        }
        
    except Exception as e:
        logger.error(f"Regional analytics error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch regional data")


@router.get("/analytics/realtime")
async def get_realtime_stats():
    """Get real-time statistics (for live dashboard updates)."""
    
    try:
        # Last hour applications
        hour_ago = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        hour_result = (
            supabase.table("applications")
            .select("phone, portal, submitted_at")
            .gte("submitted_at", hour_ago)
            .order("submitted_at", desc=True)
            .execute()
        )
        last_hour_applications = latest_applications_by_phone_portal(hour_result.data or [])
        
        # Active sessions (last 15 minutes)
        fifteen_min_ago = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
        sessions_result = (
            supabase.table("sessions")
            .select("*", count="exact")
            .gte("updated_at", fifteen_min_ago)
            .execute()
        )
        
        # Pending disbursements
        pending_result = (
            supabase.table("disbursement_tracking")
            .select("*", count="exact")
            .eq("status", "pending")
            .execute()
        )
        
        return {
            "last_hour_applications": len(last_hour_applications),
            "active_sessions": sessions_result.count or 0,
            "pending_disbursements": pending_result.count or 0,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        
    except Exception as e:
        logger.error(f"Realtime stats error: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch realtime stats")
