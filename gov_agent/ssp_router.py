import random
import string
from datetime import datetime, timezone, timedelta
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from gov_agent.application_store import save_latest_application
from gov_agent.db import supabase
from gov_agent.digilocker_router import get_latest_review_session_for_phone
from gov_agent.user_auth import optional_jwt as _optional_jwt
from gov_agent.user_auth import require_phone_access

router = APIRouter()


class SSPDraftRequest(BaseModel):
    current_step: str = "step-1"
    language: str = "en"
    fields: dict[str, Any] = Field(default_factory=dict)
    submission_status: str = "draft"
    confirmation_number: Optional[str] = None


DEFAULT_SSP_DRAFT = {
    "current_step": "step-1",
    "language": "en",
    "fields": {},
    "submission_status": "draft",
    "confirmation_number": None,
}

_REQUIRED_SUBMISSION_FIELDS = (
    "student_name",
    "dob",
    "aadhaar_number",
    "college_name",
    "course_name",
)
def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ensure_session(phone: str) -> dict[str, Any]:
    result = supabase.table("sessions").select("*").eq("phone", phone).limit(1).execute()
    if result.data:
        return result.data[0]

    row = {
        "phone": phone,
        "state": "greeting",
        "collected_data": {},
        "updated_at": _utcnow_iso(),
    }
    supabase.table("sessions").insert(row).execute()
    return row


def _save_session(phone: str, state: str, collected_data: dict[str, Any]) -> None:
    supabase.table("sessions").upsert(
        {
            "phone": phone,
            "state": state,
            "collected_data": collected_data,
            "updated_at": _utcnow_iso(),
        },
        on_conflict="phone",
    ).execute()


def _get_saved_draft(phone: str) -> dict[str, Any]:
    session = _ensure_session(phone)
    collected_data = dict(session.get("collected_data") or {})
    drafts = dict(collected_data.get("portal_drafts") or {})
    saved = drafts.get("ssp") or {}
    return dict(saved)


def _load_profile(phone: str) -> dict[str, Any]:
    result = supabase.table("citizen_profiles").select("*").eq("phone", phone).limit(1).execute()
    return result.data[0] if result.data else {}


def _profile_to_ssp_fields(profile: dict[str, Any]) -> dict[str, Any]:
    return {
        "student_name": profile.get("full_name") or "",
        "father_name": profile.get("father_name") or "",
        "mother_name": profile.get("mother_name") or "",
        "dob": profile.get("dob") or "",
        "gender": profile.get("gender") or "",
        "mobile": profile.get("phone") or "",
        "email": profile.get("email") or "",
        "religion": profile.get("religion") or "",
        "category": profile.get("caste") or "",
        "caste": profile.get("caste") or "",
        "income": profile.get("income") or "",
        "home_district": profile.get("district") or "",
        "pincode": profile.get("pincode") or "",
        "permanent_address": profile.get("address") or "",
        "college_name": profile.get("institution") or "",
        "course_name": profile.get("course_name") or profile.get("course_level") or "",
        "previous_year_percentage_or_cgpa": profile.get("marks_pct") or "",
        "bank_account": profile.get("bank_account") or "",
        "bank_ifsc": profile.get("bank_ifsc") or "",
        "bank_name": profile.get("bank_name") or "",
    }


def _review_to_ssp_fields(review: dict[str, Any] | None) -> dict[str, Any]:
    if not review:
        return {}

    imported = dict(review.get("imported_fields") or {})
    portal_prefill = dict(review.get("portal_prefill") or {})

    aadhaar_number = imported.get("aadhaar_number") or str(portal_prefill.get("aadhaar") or "").replace(" ", "")
    return {
        "student_name": imported.get("name") or portal_prefill.get("name") or "",
        "dob": imported.get("dob") or portal_prefill.get("dob") or "",
        "gender": imported.get("gender") or portal_prefill.get("gender") or "",
        "aadhaar_number": aadhaar_number or "",
        "income": imported.get("income") or portal_prefill.get("income") or "",
        "category": imported.get("category") or imported.get("caste") or portal_prefill.get("category") or "",
        "caste": imported.get("caste") or portal_prefill.get("category") or "",
        "mobile": portal_prefill.get("mobile") or "",
        "previous_year_percentage_or_cgpa": imported.get("marks_pct") or portal_prefill.get("marks") or "",
        "previous_year_marks_obtained": imported.get("marks_obtained") or portal_prefill.get("previousYearMarksObtained") or "",
        "previous_year_max_marks": imported.get("max_marks") or portal_prefill.get("previousYearMaxMarks") or "",
        "sslc_board": imported.get("board") or portal_prefill.get("board") or "",
        "income_certificate_number": imported.get("income_certificate_number") or portal_prefill.get("incomeCertificateNumber") or "",
        "caste_certificate_number": imported.get("caste_certificate_number") or portal_prefill.get("casteCertificateNumber") or "",
    }


def _merge_fields(*field_sets: dict[str, Any]) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    for field_set in field_sets:
        for key, value in field_set.items():
            if value in (None, ""):
                continue
            merged[key] = value
    return merged


def _build_draft(phone: str) -> dict[str, Any]:
    saved = _get_saved_draft(phone)
    profile_fields = _profile_to_ssp_fields(_load_profile(phone))
    review_fields = _review_to_ssp_fields(get_latest_review_session_for_phone(phone))
    saved_fields = dict(saved.get("fields") or {})

    return {
        "current_step": saved.get("current_step") or DEFAULT_SSP_DRAFT["current_step"],
        "language": saved.get("language") or DEFAULT_SSP_DRAFT["language"],
        "fields": _merge_fields(profile_fields, review_fields, saved_fields),
        "submission_status": saved.get("submission_status") or DEFAULT_SSP_DRAFT["submission_status"],
        "confirmation_number": saved.get("confirmation_number") or DEFAULT_SSP_DRAFT["confirmation_number"],
    }


def _sync_profile_into_draft(phone: str) -> tuple[dict[str, Any], list[str]]:
    saved = _get_saved_draft(phone)
    saved_fields = dict(saved.get("fields") or {})
    profile_fields = _profile_to_ssp_fields(_load_profile(phone))
    review_fields = _review_to_ssp_fields(get_latest_review_session_for_phone(phone))
    source_fields = _merge_fields(profile_fields, review_fields)

    merged_fields = dict(saved_fields)
    merged_fields.update(source_fields)

    updated_fields = sorted(
        key for key, value in source_fields.items()
        if saved_fields.get(key) != value
    )

    draft = {
        "current_step": saved.get("current_step") or DEFAULT_SSP_DRAFT["current_step"],
        "language": saved.get("language") or DEFAULT_SSP_DRAFT["language"],
        "fields": merged_fields,
        "submission_status": saved.get("submission_status") or DEFAULT_SSP_DRAFT["submission_status"],
        "confirmation_number": saved.get("confirmation_number") or DEFAULT_SSP_DRAFT["confirmation_number"],
    }
    return _persist_draft(phone, draft, state="ssp_profile_synced"), updated_fields


def _validate_required_fields(fields: dict[str, Any]) -> list[str]:
    missing = []
    for field in _REQUIRED_SUBMISSION_FIELDS:
        value = fields.get(field)
        if value is None or str(value).strip() == "":
            missing.append(field)
    if not fields.get("final_declaration_accepted"):
        missing.append("final_declaration_accepted")
    return missing


def _build_confirmation_number() -> str:
    suffix = ''.join(random.choices(string.ascii_uppercase + string.digits, k=10))
    return f"SSP2026{suffix}"


def _build_timeline() -> list[dict[str, Any]]:
    today = datetime.now()
    fmt = lambda d: d.strftime("%Y-%m-%d")
    return [
        {"step": "Applied", "icon": "📝", "date": fmt(today), "est_date": fmt(today), "done": True},
        {"step": "Under Review", "icon": "🔍", "date": None, "est_date": fmt(today + timedelta(days=7)), "done": False},
        {"step": "Approved", "icon": "✅", "date": None, "est_date": fmt(today + timedelta(days=14)), "done": False},
        {"step": "Disbursed", "icon": "💰", "date": None, "est_date": fmt(today + timedelta(days=21)), "done": False},
    ]


def _persist_draft(phone: str, draft: dict[str, Any], state: str = "ssp_web_draft") -> dict[str, Any]:
    session = _ensure_session(phone)
    collected_data = dict(session.get("collected_data") or {})
    drafts = dict(collected_data.get("portal_drafts") or {})
    drafts["ssp"] = draft
    collected_data["portal_drafts"] = drafts
    _save_session(phone, state, collected_data)
    return draft


@router.get("/ssp/draft/{phone}")
async def get_ssp_draft(phone: str, token_phone: Optional[str] = Depends(_optional_jwt)):
    phone = require_phone_access(phone, token_phone)
    return {"draft": _build_draft(phone)}


@router.put("/ssp/draft/{phone}")
async def save_ssp_draft(phone: str, body: SSPDraftRequest, token_phone: Optional[str] = Depends(_optional_jwt)):
    phone = require_phone_access(phone, token_phone)

    draft = {
        "current_step": body.current_step,
        "language": body.language,
        "fields": dict(body.fields or {}),
        "submission_status": body.submission_status,
        "confirmation_number": body.confirmation_number,
    }
    saved = _persist_draft(phone, draft)
    return {"status": "saved", "draft": saved}


@router.post("/ssp/draft/{phone}/sync-profile")
async def sync_ssp_profile(phone: str, token_phone: Optional[str] = Depends(_optional_jwt)):
    phone = require_phone_access(phone, token_phone)

    draft, updated_fields = _sync_profile_into_draft(phone)
    return {
        "status": "synced",
        "draft": draft,
        "updated_fields": updated_fields,
        "updated_count": len(updated_fields),
    }


@router.post("/ssp/draft/{phone}/submit")
async def submit_ssp_draft(phone: str, body: SSPDraftRequest, token_phone: Optional[str] = Depends(_optional_jwt)):
    phone = require_phone_access(phone, token_phone)

    if body.confirmation_number and body.submission_status == "submitted":
        return {
            "status": "success",
            "confirmation_number": body.confirmation_number,
            "draft": body.model_dump(),
        }

    missing_fields = _validate_required_fields(body.fields)
    if missing_fields:
        raise HTTPException(
            status_code=400,
            detail={"error": "Missing required fields", "missing_fields": missing_fields},
        )

    saved_application = save_latest_application(
        phone=phone,
        portal="ssp",
        service="SSP Scholarship",
        status="submitted",
        timeline_steps=_build_timeline(),
        confirmation_number_factory=_build_confirmation_number,
        db_client=supabase,
    )
    confirmation_number = str(saved_application["confirmation_number"])

    draft = {
        "current_step": body.current_step,
        "language": body.language,
        "fields": dict(body.fields or {}),
        "submission_status": "submitted",
        "confirmation_number": confirmation_number,
    }
    _persist_draft(phone, draft, state="completed")

    try:
        supabase.table("activity_feed").insert(
            {
                "phone": phone,
                "event": f"📝 SSP application received. Confirmation: {confirmation_number}",
                "created_at": _utcnow_iso(),
            }
        ).execute()
    except Exception:
        pass

    return {
        "status": "success",
        "confirmation_number": confirmation_number,
        "draft": draft,
    }
