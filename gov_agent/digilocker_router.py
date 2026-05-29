"""
DigiLocker Mock Integration — Portal-Aware Review Hub

Simulates a production-shaped DigiLocker integration:
- portal-aware document preparation
- mock consent creation
- scope-filtered document fetch
- shared review-session state for web and WhatsApp
"""

import asyncio
import hashlib
import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from gov_agent.config import FRONTEND_URL, MOCK_DIGILOCKER, MOCK_DIGILOCKER_CALLBACK_DELAY_SECONDS
from gov_agent.db import supabase
from gov_agent.demo_documents import load_demo_document_asset
from gov_agent.digilocker_agent import (
    build_portal_prefill,
    extract_prefill_data_from_documents,
)
from gov_agent.document_vault import ingest_document
from gov_agent.user_auth import optional_jwt as _optional_jwt
from gov_agent.user_auth import require_authenticated_phone, require_phone_access

logger = logging.getLogger(__name__)
router = APIRouter()


class CreateConsentRequest(BaseModel):
    phone: str
    portal: str = "profile"
    channel: Literal["web", "whatsapp"] = "web"
    return_to: str | None = None
    selected_optional_docs: list[str] | None = None


class ConsentResponse(BaseModel):
    consent_id: str
    redirect_url: str
    status: str
    expires_at: str


class ReviewDecisionRequest(BaseModel):
    phone: str | None = None
    decision: Literal["use", "edit", "save"]


MOCK_DOCUMENTS = [
    {
        "doctype": "aadhaar",
        "name": "Aadhaar Card",
        "uri": "digilocker://mock/aadhaar/1234",
        "size": 24580,
        "mime_type": "application/pdf",
        "data": "JVBERi0xLjQKJeLjz9MKMyAwIG9iago8PAovVHlwZSAvUGFnZQo+PgplbmRvYmoK",
    },
    {
        "doctype": "income_certificate",
        "name": "Income and Caste Certificate",
        "uri": "digilocker://mock/income-caste/RD1218190096391",
        "size": 18432,
        "mime_type": "application/pdf",
        "data": "JVBERi0xLjQKJeLjz9MKMyAwIG9iago8PAovVHlwZSAvUGFnZQo+PgplbmRvYmoK",
    },
    {
        "doctype": "caste_certificate",
        "name": "Income and Caste Certificate",
        "uri": "digilocker://mock/income-caste/RD1218190096391",
        "size": 18432,
        "mime_type": "application/pdf",
        "data": "JVBERi0xLjQKJeLjz9MKMyAwIG9iago8PAovVHlwZSAvUGFnZQo+PgplbmRvYmoK",
    },
    {
        "doctype": "marksheet",
        "name": "Marksheet 2025",
        "uri": "digilocker://mock/marksheet/4455",
        "size": 17220,
        "mime_type": "application/pdf",
        "data": "JVBERi0xLjQKJeLjz9MKTXlNYXJrc2hlZXQKUEZERGF0YQplbmRvYmoK",
    },
]

_VAULT_TYPE_MAP = {
    "aadhaar": "aadhaar",
    "income_certificate": "income_cert",
    "caste_certificate": "caste_cert",
    "marksheet": "marksheet",
}

_PORTAL_RULES: dict[str, dict[str, Any]] = {
    "nsp": {
        "label": "NSP",
        "required_docs": ["aadhaar", "income_certificate"],
        "optional_docs": ["caste_certificate", "marksheet"],
        "required_fields": ["name", "dob", "aadhaar_number", "income"],
        "next_url": "/nsp/apply",
    },
    "ssp": {
        "label": "SSP",
        "required_docs": ["aadhaar"],
        "optional_docs": ["income_certificate", "caste_certificate", "marksheet"],
        "required_fields": ["name", "dob", "aadhaar_number"],
        "next_url": "/ssp/dashboard",
    },
    "csss": {
        "label": "CSSS",
        "required_docs": ["aadhaar", "marksheet"],
        "optional_docs": ["income_certificate"],
        "required_fields": ["name", "dob", "aadhaar_number", "marks_pct"],
        "next_url": "/nsp/apply?portal=csss",
    },
    "minority": {
        "label": "Minority Scholarship",
        "required_docs": ["aadhaar", "income_certificate"],
        "optional_docs": ["marksheet", "caste_certificate"],
        "required_fields": ["name", "dob", "aadhaar_number", "income"],
        "next_url": "/nsp/apply?portal=minority",
    },
    "profile": {
        "label": "Profile Sync",
        "required_docs": ["aadhaar"],
        "optional_docs": ["income_certificate", "caste_certificate", "marksheet"],
        "required_fields": ["name", "dob", "aadhaar_number"],
        "next_url": "/profile",
    },
}


def _utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _require_mock_digilocker() -> None:
    if not MOCK_DIGILOCKER:
        raise HTTPException(status_code=503, detail="Mock DigiLocker is disabled")


async def _sleep_for_mock_delay(seconds: float) -> None:
    if seconds > 0:
        await asyncio.sleep(seconds)


def _hash_callback_token(token: str) -> str:
    return hashlib.sha256(str(token or "").encode("utf-8")).hexdigest()


def _get_portal_rules(portal: str | None) -> dict[str, Any]:
    key = str(portal or "profile").strip().lower()
    return _PORTAL_RULES.get(key, _PORTAL_RULES["profile"])


def _normalize_scope(rules: dict[str, Any], selected_optional_docs: list[str] | None) -> list[str]:
    required = list(rules["required_docs"])
    optional = list(rules["optional_docs"])
    allowed_optional = set(optional)

    if selected_optional_docs is None:
        chosen_optional = optional
    else:
        chosen_optional = [doc for doc in selected_optional_docs if doc in allowed_optional]

    scope: list[str] = []
    for doc in [*required, *chosen_optional]:
        if doc not in scope:
            scope.append(doc)
    return scope


def _build_next_url(portal: str, review_session_id: str, decision: str) -> str:
    if decision in {"edit", "save"} or portal == "profile":
        return f"/profile?review_session={review_session_id}"
    base = _get_portal_rules(portal)["next_url"]
    separator = "&" if "?" in base else "?"
    return f"{base}{separator}review_session={review_session_id}"


def get_portal_doc_plan(portal: str) -> dict[str, Any]:
    rules = _get_portal_rules(portal)
    return {
        "portal": str(portal or "profile").lower(),
        "label": rules["label"],
        "required_docs": list(rules["required_docs"]),
        "optional_docs": list(rules["optional_docs"]),
        "next_url": rules["next_url"],
    }


def _materialize_mock_document(doc: dict[str, Any]) -> dict[str, Any]:
    materialized = dict(doc)
    asset = load_demo_document_asset(str(doc.get("doctype") or ""))
    if asset:
        materialized.update(asset)
    return materialized


def _dedupe_visible_documents(documents: list[dict[str, Any]]) -> list[dict[str, Any]]:
    visible: list[dict[str, Any]] = []
    seen: set[str] = set()
    for doc in documents:
        key = str(doc.get("uri") or doc.get("name") or doc.get("doc_type") or "")
        if key in seen:
            continue
        seen.add(key)
        visible.append(doc)
    return visible


@router.get("/digilocker/portal-config/{portal}")
async def get_portal_config(portal: str):
    return get_portal_doc_plan(portal)


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


def _store_consent_context(phone: str, consent_id: str, context: dict[str, Any]) -> None:
    session = _ensure_session(phone)
    collected_data = dict(session.get("collected_data") or {})
    context_map = dict(collected_data.get("digilocker_context_by_consent") or {})
    context_map[consent_id] = context
    collected_data["digilocker_context_by_consent"] = context_map
    _save_session(phone, session.get("state", "greeting"), collected_data)


def _get_consent_context(phone: str, consent_id: str) -> dict[str, Any]:
    session = _ensure_session(phone)
    collected_data = dict(session.get("collected_data") or {})
    context_map = dict(collected_data.get("digilocker_context_by_consent") or {})
    return dict(context_map.get(consent_id) or {})


def _store_review_session(phone: str, review_session_id: str, review: dict[str, Any]) -> None:
    session = _ensure_session(phone)
    collected_data = dict(session.get("collected_data") or {})
    review_map = dict(collected_data.get("digilocker_review_sessions") or {})
    review_map[review_session_id] = review
    collected_data["digilocker_review_sessions"] = review_map
    collected_data["latest_digilocker_review_session"] = review_session_id
    _save_session(phone, session.get("state", "greeting"), collected_data)


def _get_review_session(phone: str, review_session_id: str) -> dict[str, Any] | None:
    session = _ensure_session(phone)
    collected_data = dict(session.get("collected_data") or {})
    review_map = dict(collected_data.get("digilocker_review_sessions") or {})
    review = review_map.get(review_session_id)
    return dict(review) if review else None


def get_review_session_for_phone(phone: str, review_session_id: str) -> dict[str, Any] | None:
    return _get_review_session(phone, review_session_id)


def get_latest_review_session_for_phone(phone: str) -> dict[str, Any] | None:
    session = _ensure_session(phone)
    collected_data = dict(session.get("collected_data") or {})
    review_session_id = str(collected_data.get("latest_digilocker_review_session") or "").strip()
    if not review_session_id:
        return None
    return _get_review_session(phone, review_session_id)


def _mark_digilocker_connected(phone: str) -> None:
    supabase.table("citizen_profiles").upsert(
        {
            "phone": phone,
            "digilocker_connected": True,
            "updated_at": _utcnow_iso(),
        },
        on_conflict="phone",
    ).execute()


def _apply_review_to_profile(phone: str, imported_fields: dict[str, Any]) -> None:
    aadhaar_digits = "".join(ch for ch in str(imported_fields.get("aadhaar_number") or "") if ch.isdigit())
    updates: dict[str, Any] = {
        "phone": phone,
        "digilocker_connected": True,
        "updated_at": _utcnow_iso(),
    }

    if imported_fields.get("name"):
        updates["full_name"] = imported_fields["name"]
    if imported_fields.get("dob"):
        updates["dob"] = imported_fields["dob"]
    if imported_fields.get("gender"):
        updates["gender"] = imported_fields["gender"]
    if aadhaar_digits:
        updates["aadhaar_last4"] = aadhaar_digits[-4:]
    if imported_fields.get("address"):
        updates["address"] = imported_fields["address"]
    if imported_fields.get("income") is not None:
        updates["income"] = imported_fields["income"]
    if imported_fields.get("caste"):
        updates["caste"] = str(imported_fields["caste"]).lower()

    supabase.table("citizen_profiles").upsert(updates, on_conflict="phone").execute()


def _build_review_payload(
    *,
    phone: str,
    consent_id: str,
    portal: str,
    channel: str,
    return_to: str,
    documents: list[dict[str, Any]],
    imported_fields: dict[str, Any],
) -> dict[str, Any]:
    rules = _get_portal_rules(portal)
    review_session_id = f"review-{uuid.uuid4().hex[:12]}"
    missing_fields = [field for field in rules["required_fields"] if not imported_fields.get(field)]
    return {
        "review_session_id": review_session_id,
        "portal": portal,
        "portal_label": rules["label"],
        "channel": channel,
        "return_to": return_to,
        "consent_id": consent_id,
        "documents": documents,
        "imported_fields": imported_fields,
        "portal_prefill": build_portal_prefill(portal, imported_fields, phone),
        "missing_fields": missing_fields,
        "status": "ready",
        "decision": None,
        "created_at": _utcnow_iso(),
        "next_url": _build_next_url(portal, review_session_id, "use"),
    }


def format_review_summary(review: dict[str, Any]) -> str:
    document_names = ", ".join(doc.get("name", "Document") for doc in review.get("documents") or []) or "No documents"
    imported = review.get("imported_fields") or {}
    pretty_map = {
        "name": "Name",
        "dob": "DOB",
        "income": "Income",
        "aadhaar_number": "Aadhaar",
        "gender": "Gender",
        "caste": "Caste",
        "caste_name": "Caste Name",
        "income_certificate_number": "Income Certificate",
        "caste_certificate_number": "Caste Certificate",
        "marks_pct": "Marks",
        "marks_obtained": "Marks Obtained",
        "max_marks": "Max Marks",
    }
    imported_lines = []
    for key in (
        "name",
        "dob",
        "income",
        "income_certificate_number",
        "aadhaar_number",
        "gender",
        "caste",
        "caste_name",
        "caste_certificate_number",
        "marks_pct",
        "marks_obtained",
        "max_marks",
    ):
        value = imported.get(key)
        if value in (None, "", []):
            continue
        imported_lines.append(f"• {pretty_map[key]}: {value}")

    missing_fields = review.get("missing_fields") or []
    missing_label = ", ".join(field.replace("_", " ") for field in missing_fields) if missing_fields else "none"

    lines = [
        f"📋 *DigiLocker Review for {review.get('portal_label', 'your portal')}*",
        "",
        f"Documents received: {document_names}",
    ]
    if imported_lines:
        lines.extend(["", "Imported fields:"])
        lines.extend(imported_lines)
    lines.extend([
        "",
        f"Missing fields: {missing_label}",
        "",
        "Reply *USE* to continue, *EDIT* to review first, or *SAVE* to keep this for later.",
    ])
    return "\n".join(lines)


def apply_review_decision_for_phone(phone: str, review_session_id: str, decision: str) -> dict[str, Any]:
    review = _get_review_session(phone, review_session_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review session not found")

    normalized = str(decision or "").lower()
    if normalized not in {"use", "edit", "save"}:
        raise HTTPException(status_code=400, detail="Invalid decision")

    review["decision"] = normalized
    review["status"] = {
        "use": "approved",
        "edit": "needs_edit",
        "save": "saved",
    }[normalized]
    review["next_url"] = _build_next_url(review["portal"], review_session_id, normalized)

    _apply_review_to_profile(phone, review.get("imported_fields") or {})
    if normalized == "use":
        supabase.table("digilocker_docs").update({
            "used_in_application": True,
        }).eq("consent_id", review["consent_id"]).execute()

    _store_review_session(phone, review_session_id, review)
    return review


@router.post("/digilocker/mock/consent", response_model=ConsentResponse)
async def create_mock_consent(
    body: CreateConsentRequest,
    token_phone: str | None = Depends(_optional_jwt),
):
    """Create a portal-aware mock DigiLocker consent request."""
    _require_mock_digilocker()

    phone = require_phone_access(body.phone, token_phone)
    rules = _get_portal_rules(body.portal)
    scope = _normalize_scope(rules, body.selected_optional_docs)
    consent_id = f"mock-consent-{uuid.uuid4().hex[:12]}"
    callback_token = secrets.token_urlsafe(24)
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
    callback_path = f"/digilocker/callback?consent_id={consent_id}&callback_token={callback_token}"
    callback_url = callback_path if body.channel == "web" else f"{FRONTEND_URL}{callback_path}"
    return_to = body.return_to or rules["next_url"]

    _ensure_session(phone)
    _store_consent_context(
        phone,
        consent_id,
        {
            "portal": str(body.portal or "profile").lower(),
            "channel": body.channel,
            "return_to": return_to,
            "callback_token_hash": _hash_callback_token(callback_token),
            "required_docs": list(rules["required_docs"]),
            "optional_docs": list(rules["optional_docs"]),
            "selected_optional_docs": [doc for doc in scope if doc not in rules["required_docs"]],
            "scope": scope,
        },
    )

    supabase.table("digilocker_consents").insert({
        "consent_id": consent_id,
        "phone": phone,
        "status": "pending",
        "scope": scope,
        "redirect_url": return_to,
        "expires_at": expires_at.isoformat(),
        "created_at": _utcnow_iso(),
    }).execute()

    logger.info("Mock DigiLocker consent created for %s: %s", phone, consent_id)

    return ConsentResponse(
        consent_id=consent_id,
        redirect_url=callback_url,
        status="pending",
        expires_at=expires_at.isoformat(),
    )


@router.get("/digilocker/mock/callback")
async def mock_callback(
    consent_id: str,
    action: str = "approve",
    callback_token: str = Query(..., min_length=16),
    token_phone: str | None = Depends(_optional_jwt),
):
    """Simulate a callback from DigiLocker and create a shared review session."""
    _require_mock_digilocker()

    await _sleep_for_mock_delay(MOCK_DIGILOCKER_CALLBACK_DELAY_SECONDS)

    result = supabase.table("digilocker_consents").select("*").eq("consent_id", consent_id).limit(1).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Consent not found")

    consent = result.data[0]
    phone = require_phone_access(str(consent["phone"]), require_authenticated_phone(token_phone))
    scope = list(consent.get("scope") or [])
    context = _get_consent_context(phone, consent_id)
    if _hash_callback_token(callback_token) != str(context.get("callback_token_hash") or ""):
        raise HTTPException(status_code=403, detail="Invalid callback token")
    portal = str(context.get("portal") or "profile")
    channel = str(context.get("channel") or "web")
    return_to = str(context.get("return_to") or _get_portal_rules(portal)["next_url"])

    if action == "reject":
        supabase.table("digilocker_consents").update({
            "status": "rejected",
            "updated_at": _utcnow_iso(),
        }).eq("consent_id", consent_id).execute()
        return {"status": "rejected", "message": "User denied access"}

    fetched_documents: list[dict[str, Any]] = []
    materialized_documents = [_materialize_mock_document(doc) for doc in MOCK_DOCUMENTS]
    materialized_by_type = {str(doc["doctype"]): doc for doc in materialized_documents}
    for doc in materialized_documents:
        if doc["doctype"] not in scope:
            continue

        supabase.table("digilocker_docs").insert({
            "consent_id": consent_id,
            "phone": phone,
            "doc_type": doc["doctype"],
            "name": doc["name"],
            "digilocker_uri": doc["uri"],
            "size": doc["size"],
            "mime_type": doc["mime_type"],
            "raw_data": doc["data"],
            "fetched_at": _utcnow_iso(),
        }).execute()

        fetched_documents.append({
            "doc_type": doc["doctype"],
            "name": doc["name"],
            "mime_type": doc["mime_type"],
            "uri": doc["uri"],
        })

        vault_type = _VAULT_TYPE_MAP.get(doc["doctype"])
        if vault_type:
            try:
                await ingest_document(
                    phone=phone,
                    doc_type=vault_type,
                    source="digilocker",
                    image_b64=doc["data"],
                    file_name=doc.get("file_name") or doc["name"].lower().replace(" ", "-") + ".pdf",
                    mime_type=doc["mime_type"],
                )
            except Exception as exc:
                logger.warning("DigiLocker vault sync failed for %s/%s: %s", phone, doc["doctype"], exc)

    imported_fields = extract_prefill_data_from_documents(
        [
            {
                "doc_type": doc["doc_type"],
                "raw_data": materialized_by_type[doc["doc_type"]]["data"],
            }
            for doc in fetched_documents
        ]
    )
    visible_documents = _dedupe_visible_documents(fetched_documents)
    review = _build_review_payload(
        phone=phone,
        consent_id=consent_id,
        portal=portal,
        channel=channel,
        return_to=return_to,
        documents=visible_documents,
        imported_fields=imported_fields,
    )
    _store_review_session(phone, review["review_session_id"], review)
    _mark_digilocker_connected(phone)

    supabase.table("digilocker_consents").update({
        "status": "completed",
        "documents_fetched": len(visible_documents),
        "updated_at": _utcnow_iso(),
    }).eq("consent_id", consent_id).execute()

    logger.info("Mock DigiLocker consent completed for %s: %s", phone, consent_id)

    review_url = f"/digilocker/review/{review['review_session_id']}"

    return {
        "status": "success",
        "consent_id": consent_id,
        "documents_fetched": len(visible_documents),
        "documents": visible_documents,
        "review_session_id": review["review_session_id"],
        "review_url": review_url,
        "message": "DigiLocker connected successfully",
    }


@router.get("/digilocker/review/{review_session_id}")
async def get_review_session(
    review_session_id: str,
    token_phone: str | None = Depends(_optional_jwt),
):
    phone = require_authenticated_phone(token_phone)
    review = _get_review_session(phone, review_session_id)
    if not review:
        raise HTTPException(status_code=404, detail="Review session not found")
    return review


@router.post("/digilocker/review/{review_session_id}/decision")
async def apply_review_decision(
    review_session_id: str,
    body: ReviewDecisionRequest,
    token_phone: str | None = Depends(_optional_jwt),
):
    review = apply_review_decision_for_phone(
        require_authenticated_phone(token_phone),
        review_session_id,
        body.decision,
    )

    return {
        "review_session_id": review_session_id,
        "decision": review["decision"],
        "portal": review["portal"],
        "next_url": review["next_url"],
        "status": review["status"],
    }


@router.get("/digilocker/mock/documents/{consent_id}")
async def get_mock_documents(
    consent_id: str,
    token_phone: str | None = Depends(_optional_jwt),
):
    _require_mock_digilocker()
    consent_result = supabase.table("digilocker_consents").select("*").eq("consent_id", consent_id).limit(1).execute()
    if not consent_result.data:
        raise HTTPException(status_code=404, detail="Consent not found")
    require_phone_access(str(consent_result.data[0]["phone"]), require_authenticated_phone(token_phone))

    result = supabase.table("digilocker_docs").select("*").eq("consent_id", consent_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="No documents found")
    return {
        "consent_id": consent_id,
        "documents": result.data,
        "total": len(result.data),
    }


@router.get("/digilocker/mock/status/{consent_id}")
async def get_mock_status(
    consent_id: str,
    token_phone: str | None = Depends(_optional_jwt),
):
    _require_mock_digilocker()
    result = supabase.table("digilocker_consents").select("*").eq("consent_id", consent_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Consent not found")
    require_phone_access(str(result.data[0]["phone"]), require_authenticated_phone(token_phone))
    return result.data[0]


@router.post("/digilocker/mock/reset/{phone}")
async def reset_mock_digilocker(
    phone: str,
    token_phone: str | None = Depends(_optional_jwt),
):
    _require_mock_digilocker()
    phone = require_phone_access(phone, token_phone)
    supabase.table("digilocker_consents").delete().eq("phone", phone).execute()
    supabase.table("digilocker_docs").delete().eq("phone", phone).execute()

    session = _ensure_session(phone)
    collected_data = dict(session.get("collected_data") or {})
    collected_data.pop("digilocker_context_by_consent", None)
    collected_data.pop("digilocker_review_sessions", None)
    collected_data.pop("latest_digilocker_review_session", None)
    _save_session(phone, session.get("state", "greeting"), collected_data)

    return {"message": f"Reset DigiLocker data for {phone}"}
