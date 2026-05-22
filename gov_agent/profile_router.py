"""
Citizen Profile router for GovBot.

Provides a persistent citizen profile that acts as the single source of truth
for auto-filling government forms — users enter their data once and every future
form is pre-populated from this profile.

Routes:
  GET  /profile/{phone}              — fetch full profile (JWT-protected)
  POST /profile/{phone}              — upsert profile fields
  POST /profile/{phone}/from-ocr     — populate profile from latest OCR extraction
  GET  /profile/{phone}/completeness — percentage complete + missing fields list
"""

import logging
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel

from gov_agent.config import SECRET_KEY
from gov_agent.db import supabase
from gov_agent.document_vault import build_profile_updates, list_user_documents

logger = logging.getLogger(__name__)
router = APIRouter()
_bearer = HTTPBearer(auto_error=False)

# ---------------------------------------------------------------------------
# Profile fields and their weights for completeness calculation
# ---------------------------------------------------------------------------
_PROFILE_FIELDS: dict[str, int] = {
    "full_name": 10,
    "dob": 10,
    "gender": 5,
    "aadhaar_last4": 10,
    "address": 5,
    "state": 5,
    "district": 3,
    "pincode": 3,
    "income": 10,
    "caste": 8,
    "religion": 3,
    "course_level": 5,
    "institution": 5,
    "marks_pct": 5,
    "bank_account": 8,
    "bank_ifsc": 5,
    "bank_name": 3,
    "father_name": 5,
    "email": 3,
}
_TOTAL_WEIGHT = sum(_PROFILE_FIELDS.values())


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class ProfileUpsert(BaseModel):
    full_name: Optional[str] = None
    dob: Optional[str] = None
    gender: Optional[str] = None
    aadhaar_last4: Optional[str] = None
    address: Optional[str] = None
    state: Optional[str] = None
    district: Optional[str] = None
    pincode: Optional[str] = None
    income: Optional[int] = None
    caste: Optional[str] = None
    religion: Optional[str] = None
    course_level: Optional[str] = None
    institution: Optional[str] = None
    marks_pct: Optional[float] = None
    bank_account: Optional[str] = None
    bank_ifsc: Optional[str] = None
    bank_name: Optional[str] = None
    father_name: Optional[str] = None
    mother_name: Optional[str] = None
    email: Optional[str] = None
    digilocker_connected: Optional[bool] = None


class ProfileResponse(BaseModel):
    phone: str
    profile: dict[str, Any]
    completeness_pct: int
    missing_fields: list[str]


_PROFILE_MUTABLE_FIELDS = set(ProfileUpsert.model_fields.keys())


# ---------------------------------------------------------------------------
# JWT auth dependency — accepts missing / invalid token gracefully for demo
# ---------------------------------------------------------------------------
def _optional_jwt(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> Optional[str]:
    if not creds:
        return None
    try:
        payload = jwt.decode(creds.credentials, SECRET_KEY, algorithms=["HS256"])
        return payload.get("phone") or payload.get("sub")
    except JWTError:
        return None


def _compute_completeness(profile: dict) -> tuple[int, list[str]]:
    """Return (pct_complete, list_of_missing_field_names)."""
    earned = 0
    missing = []
    for field, weight in _PROFILE_FIELDS.items():
        val = profile.get(field)
        if val is not None and str(val).strip() != "":
            earned += weight
        else:
            missing.append(field)
    pct = round(earned * 100 / _TOTAL_WEIGHT)
    return pct, missing


def _collect_vault_profile_updates(documents: list[dict[str, Any]]) -> dict[str, Any]:
    updates: dict[str, Any] = {}
    for document in documents:
        doc_type = str(document.get("doc_type", "")).strip()
        extracted_data = document.get("extracted_data") or {}
        mapped = build_profile_updates(doc_type, extracted_data)
        for key, value in mapped.items():
            if key not in _PROFILE_MUTABLE_FIELDS:
                continue
            if value is None:
                continue
            if isinstance(value, str) and not value.strip():
                continue
            updates.setdefault(key, value)
    return updates


def _merge_profile_fields(profile: dict[str, Any], updates: dict[str, Any]) -> dict[str, Any]:
    merged: dict[str, Any] = {}
    for key, value in updates.items():
        current = profile.get(key)
        if current != value:
            merged[key] = value
    return merged


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@router.get("/{phone}", response_model=ProfileResponse)
async def get_profile(phone: str, token_phone: Optional[str] = Depends(_optional_jwt)):
    if token_phone and token_phone != phone:
        raise HTTPException(status_code=403, detail="Access denied")
    try:
        resp = supabase.table("citizen_profiles").select("*").eq("phone", phone).limit(1).execute()
        if resp.data:
            profile = resp.data[0]
        else:
            profile = {"phone": phone}
        pct, missing = _compute_completeness(profile)
        return ProfileResponse(phone=phone, profile=profile, completeness_pct=pct, missing_fields=missing)
    except Exception as e:
        logger.error(f"get_profile error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{phone}", response_model=ProfileResponse)
async def upsert_profile(phone: str, body: ProfileUpsert, token_phone: Optional[str] = Depends(_optional_jwt)):
    if token_phone and token_phone != phone:
        raise HTTPException(status_code=403, detail="Access denied")
    try:
        updates: dict[str, Any] = {
            k: v for k, v in body.model_dump().items() if v is not None
        }
        if not updates:
            raise HTTPException(status_code=400, detail="No fields provided")

        updates["phone"] = phone
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()

        supabase.table("citizen_profiles").upsert(updates, on_conflict="phone").execute()

        return await get_profile(phone, token_phone=token_phone)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"upsert_profile error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{phone}/from-ocr", response_model=ProfileResponse)
async def populate_from_ocr(phone: str, token_phone: Optional[str] = Depends(_optional_jwt)):
    """Pull the latest OCR extraction for this phone and copy mapped fields into the profile."""
    if token_phone and token_phone != phone:
        raise HTTPException(status_code=403, detail="Access denied")
    try:
        ocr_resp = (
            supabase.table("ocr_extractions")
            .select("field_map")
            .eq("phone", phone)
            .order("id", desc=True)
            .limit(1)
            .execute()
        )
        if not ocr_resp.data:
            raise HTTPException(status_code=404, detail="No OCR extraction found for this phone")

        field_map: dict = ocr_resp.data[0].get("field_map", {})

        updates: dict[str, Any] = {}
        if field_map.get("name"):
            updates["full_name"] = field_map["name"]
        if field_map.get("dob"):
            updates["dob"] = field_map["dob"]
        if field_map.get("gender"):
            updates["gender"] = field_map["gender"]
        if field_map.get("address"):
            updates["address"] = field_map["address"]
        if field_map.get("aadhaar_number"):
            aadhaar = str(field_map["aadhaar_number"]).replace(" ", "")
            updates["aadhaar_last4"] = aadhaar[-4:] if len(aadhaar) >= 4 else aadhaar

        if not updates:
            raise HTTPException(status_code=422, detail="OCR extraction did not contain mappable fields")

        return await upsert_profile(phone, ProfileUpsert(**updates), token_phone=token_phone)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"populate_from_ocr error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{phone}/from-vault", response_model=ProfileResponse)
async def populate_from_vault(phone: str, token_phone: Optional[str] = Depends(_optional_jwt)):
    """Copy mapped fields from the latest unified vault documents into empty profile fields."""
    if token_phone and token_phone != phone:
        raise HTTPException(status_code=403, detail="Access denied")
    try:
        documents = list_user_documents(phone, masked=False)
        if not documents:
            raise HTTPException(status_code=404, detail="No vault documents found for this phone")

        vault_updates = _collect_vault_profile_updates(documents)
        if not vault_updates:
            raise HTTPException(status_code=422, detail="Vault documents did not contain mappable fields")

        current_resp = supabase.table("citizen_profiles").select("*").eq("phone", phone).limit(1).execute()
        current_profile = current_resp.data[0] if current_resp.data else {"phone": phone}
        synced_updates = _merge_profile_fields(current_profile, vault_updates)

        if synced_updates:
            synced_updates["phone"] = phone
            synced_updates["updated_at"] = datetime.now(timezone.utc).isoformat()
            supabase.table("citizen_profiles").upsert(synced_updates, on_conflict="phone").execute()

        return await get_profile(phone, token_phone=token_phone)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"populate_from_vault error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{phone}/completeness")
async def profile_completeness(phone: str, token_phone: Optional[str] = Depends(_optional_jwt)):
    """Return completeness % and list of missing fields without full profile data."""
    if token_phone and token_phone != phone:
        raise HTTPException(status_code=403, detail="Access denied")
    try:
        resp = supabase.table("citizen_profiles").select("*").eq("phone", phone).limit(1).execute()
        profile = resp.data[0] if resp.data else {}
        pct, missing = _compute_completeness(profile)
        return {"phone": phone, "completeness_pct": pct, "missing_fields": missing}
    except Exception as e:
        logger.error(f"profile_completeness error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
