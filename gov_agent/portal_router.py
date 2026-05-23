from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Literal, Optional
import importlib
from gov_agent import pmss_agent, csss_agent, minority_agent
from gov_agent.db import supabase
from datetime import datetime, timezone

router = APIRouter()


class PortalApplyRequest(BaseModel):
    name: str
    dob: str
    income: int
    media_id: str
    phone: str
    caste: Optional[str] = None
    marks_pct: Optional[float] = None
    religion: Optional[str] = None
    institution: Optional[str] = None
    course: Optional[str] = None


class PortalApplyResponse(BaseModel):
    status: str
    confirmation_number: Optional[str] = None
    error: Optional[str] = None


PORTALS = [
    {
        "portal_id": "nsp",
        "name": "National Scholarship Portal",
        "description": "Pre-matric and Post-matric scholarships for all categories",
        "icon": "🎓",
        "color": "#C2185B",
        "ministry": "Ministry of Education",
        "eligibility": "Income < ₹2.5L, Age 17-25"
    },
    {
        "portal_id": "pmss",
        "name": "Post Matric Scholarship Scheme",
        "description": "Post-matric scholarships for SC/ST/OBC students",
        "icon": "📚",
        "color": "#4A0E0E",
        "ministry": "Ministry of Social Justice & Empowerment",
        "eligibility": "SC/ST/OBC, Income < ₹2.5L, Post-matric"
    },
    {
        "portal_id": "csss",
        "name": "Central Sector Scholarship Scheme",
        "description": "Merit-based scholarships for degree-level students",
        "icon": "🏆",
        "color": "#0D1B4B",
        "ministry": "Ministry of Education",
        "eligibility": "Income < ₹4.5L, Marks > 80%, Degree"
    },
    {
        "portal_id": "minority",
        "name": "Minority Scholarship",
        "description": "Scholarships for students from minority communities",
        "icon": "🤝",
        "color": "#1B4332",
        "ministry": "Ministry of Minority Affairs",
        "eligibility": "Income < ₹2L, Marks > 50%, Minority religion"
    }
]


@router.get("")
async def list_portals():
    """List all available scholarship portals."""
    return {"portals": PORTALS}


@router.post("/{portal_id}/apply", response_model=PortalApplyResponse)
async def apply_portal(portal_id: str, body: PortalApplyRequest):
    """Submit application to a specific portal."""
    if portal_id not in ["nsp", "pmss", "csss", "minority"]:
        raise HTTPException(status_code=400, detail={"error": "Invalid portal_id"})

    try:
        data = body.model_dump()

        if portal_id == "pmss":
            result = await pmss_agent.run_pmss_application(data)
        elif portal_id == "csss":
            result = await csss_agent.run_csss_application(data)
        elif portal_id == "minority":
            result = await minority_agent.run_minority_application(data)
        else:
            graph = importlib.import_module("gov_agent.graph")
            result = await graph.run_application(data)

        if result.get("error"):
            return PortalApplyResponse(status="failed", error=result["error"])

        conf = result.get("submission_result", {}).get("confirmation_number")
        if conf:
            try:
                supabase.table("activity_feed").insert({
                    "phone": body.phone,
                    "event": f"📝 {portal_id.upper()} application received. It may take some time before it moves to the next stage. Confirmation: {conf}",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }).execute()
            except Exception:
                pass
        return PortalApplyResponse(status="success", confirmation_number=conf)

    except Exception as e:
        raise HTTPException(status_code=500, detail={"error": str(e)})
