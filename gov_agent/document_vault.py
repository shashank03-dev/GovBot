import base64
import hashlib
import json
import logging
import mimetypes
import os
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

import httpx

from gov_agent.config import (
    GEMINI_VISION_VALIDATION,
    LOCAL_OCR_ENABLED,
    LOCAL_OCR_TIMEOUT_SECONDS,
    SUPABASE_DOCUMENTS_BUCKET,
    WHATSAPP_TOKEN,
)
from gov_agent.db import supabase
from gov_agent.demo_documents import INCOME_CASTE_CERTIFICATE, MARKSHEET
from gov_agent.local_ocr import extract_local_ocr_text
from gov_agent.mistral_ocr_client import extract_ocr_markdown, has_mistral_ocr_client

logger = logging.getLogger(__name__)

CUSTOM_DOC_TYPE = "custom"
CUSTOM_DOC_TYPE_PREFIX = "custom::"
CUSTOM_LABEL_FIELD = "_custom_label"
DOC_TYPES = {"pan", "aadhaar", "income_cert", "caste_cert", "marksheet", CUSTOM_DOC_TYPE}
DOC_SOURCES = {"web", "whatsapp", "digilocker"}
VALIDATION_DOC_TYPES = {"aadhaar", "income_cert", "caste_cert", "marksheet"}
NO_EXPIRY_DOC_TYPES = {"pan", "aadhaar"}
ALLOWED_UPLOAD_MIME_TYPES = {"image/jpeg", "image/jpg", "image/png", "application/pdf"}
MAX_UPLOAD_BYTES = 8 * 1024 * 1024
_BUCKET_READY = False
DOCUMENT_LABELS = {
    "pan": "PAN Card",
    "aadhaar": "Aadhaar Card",
    "income_cert": "Income Certificate",
    "caste_cert": "Caste Certificate",
    "marksheet": "Marksheet",
    CUSTOM_DOC_TYPE: "Custom Document",
}


def has_gemini_client() -> bool:
    from gov_agent.gemini_client import has_gemini_client as _has_gemini_client

    return _has_gemini_client()


def inline_data_part(*, data_b64: str, mime_type: str) -> Any:
    from gov_agent.gemini_client import inline_data_part as _inline_data_part

    return _inline_data_part(data_b64=data_b64, mime_type=mime_type)


def generate_text(
    contents: Any,
    *,
    system_instruction: str | None = None,
    response_mime_type: str | None = None,
    temperature: float | None = None,
    max_output_tokens: int | None = None,
) -> str:
    from gov_agent.gemini_client import generate_text as _generate_text

    return _generate_text(
        contents,
        system_instruction=system_instruction,
        response_mime_type=response_mime_type,
        temperature=temperature,
        max_output_tokens=max_output_tokens,
    )


class DocumentVaultError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _normalize_detected_mime(mime_type: Optional[str]) -> str:
    normalized = (mime_type or "").lower()
    if normalized == "image/jpg":
        return "image/jpeg"
    return normalized


def _normalize_custom_label(custom_label: Optional[str]) -> str:
    normalized = re.sub(r"\s+", " ", str(custom_label or "").strip())
    if not normalized:
        raise DocumentVaultError(
            "upload",
            "Enter a document name before uploading a custom document.",
        )
    if len(normalized) > 80:
        raise DocumentVaultError(
            "upload",
            "Document name must be 80 characters or fewer.",
        )
    return normalized


def _is_custom_document_type(doc_type: Optional[str]) -> bool:
    normalized = str(doc_type or "")
    return normalized == CUSTOM_DOC_TYPE or normalized.startswith(CUSTOM_DOC_TYPE_PREFIX)


def _build_custom_document_storage_type(custom_label: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", custom_label.lower()).strip("-") or "document"
    return f"{CUSTOM_DOC_TYPE_PREFIX}{slug}::{uuid.uuid4().hex[:8]}"


def _document_label(doc_type: str, document: Optional[dict[str, Any]] = None, *, custom_label: Optional[str] = None) -> str:
    if doc_type == CUSTOM_DOC_TYPE:
        label = str(custom_label or (document or {}).get("custom_label") or "").strip()
        return label or DOCUMENT_LABELS[CUSTOM_DOC_TYPE]
    return DOCUMENT_LABELS.get(doc_type, doc_type.replace("_", " ").title())


def hash_passkey(pin: str) -> str:
    return hashlib.sha256(pin.encode("utf-8")).hexdigest()


def verify_passkey(pin: str, digest: Optional[str]) -> bool:
    if not digest:
        return False
    return hash_passkey(pin) == digest


def validate_stored_passkey(
    pin: Optional[str],
    *,
    stored_digest: Optional[str],
    legacy_pin: Optional[str] = None,
) -> None:
    normalized = (pin or "").strip()
    digest = str(stored_digest or "")
    legacy = str(legacy_pin or "")

    if not digest and not legacy:
        raise DocumentVaultError(
            "passkey_not_set",
            "Set a 4-digit passkey first. Use 'set pin' in WhatsApp before opening sensitive documents on the web.",
        )
    if not normalized:
        raise DocumentVaultError(
            "passkey_required",
            "Enter your 4-digit passkey to open or change this document.",
        )
    if not normalized.isdigit() or len(normalized) != 4:
        raise DocumentVaultError(
            "passkey_required",
            "Passkey must be exactly 4 digits.",
        )
    verified = verify_passkey(normalized, digest) or (legacy and normalized == legacy)
    if not verified:
        raise DocumentVaultError(
            "passkey_invalid",
            "Wrong passkey. Please try again.",
        )


def ensure_profile_passkey(phone: str, pin: Optional[str]) -> None:
    resp = (
        supabase.table("citizen_profiles")
        .select("*")
        .eq("phone", phone)
        .limit(1)
        .execute()
    )
    profile = resp.data[0] if resp.data else {}
    validate_stored_passkey(
        pin,
        stored_digest=profile.get("passkey_hash"),
        legacy_pin=profile.get("passkey"),
    )


def has_profile_passkey(phone: str) -> bool:
    """Return True when the citizen already has a document passkey configured."""
    resp = (
        supabase.table("citizen_profiles")
        .select("passkey_hash,passkey")
        .eq("phone", phone)
        .limit(1)
        .execute()
    )
    profile = resp.data[0] if resp.data else {}
    return bool(str(profile.get("passkey_hash") or "").strip() or str(profile.get("passkey") or "").strip())


def set_profile_passkey(phone: str, new_pin: Optional[str], *, current_pin: Optional[str] = None) -> None:
    """Set or change the document passkey for a citizen.

    First-time set (no existing passkey) needs no ``current_pin`` — this is what
    unblocks web-only users. Changing an existing passkey requires ``current_pin``
    to match, so a stolen session token cannot silently reset it.
    """
    normalized_new = (new_pin or "").strip()
    if not normalized_new.isdigit() or len(normalized_new) != 4:
        raise DocumentVaultError(
            "passkey_required",
            "Passkey must be exactly 4 digits.",
        )

    resp = (
        supabase.table("citizen_profiles")
        .select("passkey_hash,passkey")
        .eq("phone", phone)
        .limit(1)
        .execute()
    )
    profile = resp.data[0] if resp.data else {}
    stored_digest = str(profile.get("passkey_hash") or "").strip()
    legacy_pin = str(profile.get("passkey") or "").strip()

    if stored_digest or legacy_pin:
        # A passkey already exists — require the current one before changing it.
        validate_stored_passkey(
            current_pin,
            stored_digest=stored_digest or None,
            legacy_pin=legacy_pin or None,
        )

    supabase.table("citizen_profiles").upsert(
        {"phone": phone, "passkey_hash": hash_passkey(normalized_new)},
        on_conflict="phone",
    ).execute()


CASTE_PROFILE_VALUES = {
    "general": "general",
    "gen": "general",
    "obc": "obc",
    "other backward class": "obc",
    "other backward classes": "obc",
    "backward class": "obc",
    "backward classes": "obc",
    "category iii a": "obc",
    "category iii a backward classes": "obc",
    "iii a": "obc",
    "iiia": "obc",
    "vokkaligaru": "obc",
    "sc": "sc",
    "scheduled caste": "sc",
    "scheduled castes": "sc",
    "st": "st",
    "scheduled tribe": "st",
    "scheduled tribes": "st",
    "ews": "ews",
    "economically weaker section": "ews",
    "economically weaker sections": "ews",
}

CASTE_DOCUMENT_VALUES = {
    "general": ("General", "General"),
    "obc": ("OBC", "Other Backward Class"),
    "sc": ("SC", "Scheduled Caste"),
    "st": ("ST", "Scheduled Tribe"),
    "ews": ("EWS", "Economically Weaker Section"),
}


def _filled(value: Any) -> bool:
    return value is not None and str(value).strip() != ""


def _first_filled(*values: Any) -> Optional[Any]:
    for value in values:
        if _filled(value):
            return value
    return None


def _parse_number(value: Any, *, integer: bool = False) -> Optional[int | float]:
    if not _filled(value):
        return None
    if isinstance(value, (int, float)):
        return int(value) if integer else float(value)
    normalized = re.sub(r"[,\s₹]", "", str(value))
    try:
        parsed = float(normalized)
    except ValueError:
        return None
    return int(parsed) if integer else parsed


def _normalize_profile_caste(value: Any) -> Optional[str]:
    if not _filled(value):
        return None
    normalized = re.sub(r"[^a-z0-9]+", " ", str(value).strip().lower())
    normalized = re.sub(r"\s+", " ", normalized).strip()
    direct = CASTE_PROFILE_VALUES.get(normalized)
    if direct:
        return direct
    if "backward class" in normalized or "iii a" in normalized:
        return "obc"
    return None


def _document_caste_values(value: Any) -> Optional[tuple[str, str]]:
    normalized = _normalize_profile_caste(value)
    if not normalized:
        return None
    return CASTE_DOCUMENT_VALUES[normalized]


def _shared_profile_updates(extracted_data: dict[str, Any]) -> dict[str, Any]:
    """Fields many document types carry, mapped onto their citizen_profiles columns.

    Only keys actually present are returned, so a document that does not print a
    field never contributes a blank value to the profile.
    """
    updates: dict[str, Any] = {}
    for source_key, profile_key in (
        ("father_name", "father_name"),
        ("mother_name", "mother_name"),
        ("district", "district"),
        ("state", "state"),
        ("pincode", "pincode"),
    ):
        value = extracted_data.get(source_key)
        if _filled(value):
            updates[profile_key] = str(value).strip()
    return updates


def build_profile_updates(doc_type: str, extracted_data: dict[str, Any]) -> dict[str, Any]:
    if doc_type == "pan":
        updates = {
            key: extracted_data[key]
            for key in ("pan_number", "full_name", "father_name", "dob")
            if extracted_data.get(key)
        }
        return {**_shared_profile_updates(extracted_data), **updates}
    if doc_type == "aadhaar":
        updates = {
            key: extracted_data[key]
            for key in ("full_name", "dob", "gender", "address")
            if extracted_data.get(key)
        }
        updates = {**_shared_profile_updates(extracted_data), **updates}
        aadhaar_number = str(extracted_data.get("aadhaar_number", "")).strip()
        digits = re.sub(r"\D", "", aadhaar_number)
        if digits:
            updates["aadhaar_last4"] = digits[-4:]
        return updates
    if doc_type in {"income_cert", "caste_cert"}:
        updates = _shared_profile_updates(extracted_data)
        student_name = _first_filled(extracted_data.get("student_name"), extracted_data.get("full_name"))
        if student_name:
            updates["full_name"] = str(student_name).strip()
        if doc_type == "income_cert":
            income = _parse_number(
                _first_filled(extracted_data.get("annual_income"), extracted_data.get("income")),
                integer=True,
            )
            if income is not None:
                updates["income"] = income
            return updates
        caste = _normalize_profile_caste(
            _first_filled(extracted_data.get("caste"), extracted_data.get("category")),
        )
        if caste:
            updates["caste"] = caste
        return updates
    if doc_type == "marksheet":
        updates = _shared_profile_updates(extracted_data)
        student_name = _first_filled(extracted_data.get("student_name"), extracted_data.get("full_name"))
        if student_name:
            updates["full_name"] = str(student_name).strip()
        marks_pct = _parse_number(
            _first_filled(extracted_data.get("percentage"), extracted_data.get("marks_pct")),
        )
        if marks_pct is not None:
            updates["marks_pct"] = marks_pct
        return updates
    return {}


def build_document_updates_from_profile(profile_updates: dict[str, Any]) -> dict[str, dict[str, Any]]:
    document_updates: dict[str, dict[str, Any]] = {}

    def add(doc_type: str, field: str, value: Any) -> None:
        if not _filled(value):
            return
        document_updates.setdefault(doc_type, {})[field] = value

    full_name = profile_updates.get("full_name")
    add("aadhaar", "full_name", full_name)
    add("pan", "full_name", full_name)
    add("marksheet", "student_name", full_name)

    add("aadhaar", "dob", profile_updates.get("dob"))
    add("pan", "dob", profile_updates.get("dob"))
    add("aadhaar", "gender", profile_updates.get("gender"))
    add("aadhaar", "address", profile_updates.get("address"))
    add("pan", "father_name", profile_updates.get("father_name"))
    add("income_cert", "annual_income", profile_updates.get("income"))
    add("marksheet", "percentage", profile_updates.get("marks_pct"))

    caste_values = _document_caste_values(profile_updates.get("caste"))
    if caste_values:
        caste, category = caste_values
        add("caste_cert", "caste", caste)
        add("caste_cert", "category", category)

    return document_updates


def merge_extracted_data(current: dict[str, Any], updates: dict[str, Any]) -> dict[str, Any]:
    merged = dict(current)
    for key, value in updates.items():
        if isinstance(value, str):
            merged[key] = value.strip()
        else:
            merged[key] = value
    return merged


def _effective_extracted_data(document: dict[str, Any]) -> dict[str, Any]:
    ocr_data = document.get("ocr_extracted_data") or document.get("extracted_data") or {}
    corrected = document.get("user_corrected_data") or {}
    return merge_extracted_data(ocr_data, corrected)


def _recover_stale_validation_status(materialized: dict[str, Any], effective: dict[str, Any]) -> None:
    doc_type = str(materialized.get("doc_type") or "")
    status = str(materialized.get("status") or "").lower()
    verification_status = str(materialized.get("verification_status") or "").lower()
    if doc_type not in VALIDATION_DOC_TYPES:
        return
    if status not in {"failed", "needs_review"}:
        return
    if verification_status not in {"", "unknown"}:
        return
    if not _has_extracted_validation_dates(effective):
        return

    try:
        confidence = float(materialized.get("source_confidence") or materialized.get("confidence") or 0)
    except (TypeError, ValueError):
        confidence = 0.0
    if confidence < 0.6:
        return

    validation = _fallback_document_validation(doc_type, effective)
    if not validation.get("valid") or validation.get("verification_status") != "valid":
        return

    issue_date = _parse_date(validation.get("issue_date"))
    expiry_date = _parse_date(validation.get("expiry_date"))
    materialized["status"] = "ready"
    materialized["verification_status"] = "valid"
    materialized["status_reason"] = validation.get("message") or "Document validated using fallback rules."
    if issue_date:
        materialized["issue_date"] = issue_date.isoformat()
    if expiry_date:
        materialized["expiry_date"] = expiry_date.isoformat()


def _materialize_document(document: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
    if not document:
        return None
    materialized = dict(document)
    effective = _effective_extracted_data(materialized)
    doc_type = str(materialized.get("doc_type") or "")
    custom_label = str(
        materialized.get("custom_label")
        or effective.get(CUSTOM_LABEL_FIELD)
        or (materialized.get("user_corrected_data") or {}).get(CUSTOM_LABEL_FIELD)
        or (materialized.get("ocr_extracted_data") or materialized.get("extracted_data") or {}).get(CUSTOM_LABEL_FIELD)
        or ""
    ).strip()
    materialized["ocr_extracted_data"] = materialized.get("ocr_extracted_data") or materialized.get("extracted_data") or {}
    materialized["user_corrected_data"] = materialized.get("user_corrected_data") or {}
    materialized["extracted_data"] = effective
    for key in ("ocr_extracted_data", "user_corrected_data", "extracted_data"):
        payload = materialized.get(key)
        if isinstance(payload, dict):
            payload.pop(CUSTOM_LABEL_FIELD, None)
    if _is_custom_document_type(doc_type):
        materialized["doc_type"] = CUSTOM_DOC_TYPE
        if custom_label:
            materialized["custom_label"] = custom_label
    if materialized.get("source_confidence") is None:
        materialized["source_confidence"] = materialized.get("confidence", 0)
    _recover_stale_validation_status(materialized, effective)
    return materialized


def _mask_sensitive_value(key: str, value: Any) -> Any:
    if not isinstance(value, str):
        return value
    digits = re.sub(r"\D", "", value)
    if key == "aadhaar_number" and len(digits) >= 4:
        return f"XXXX XXXX {digits[-4:]}"
    if key == "pan_number" and len(value) >= 4:
        return f"{value[:2]}XXXXXX{value[-2:]}"
    return value


def mask_document_for_list(document: dict[str, Any]) -> dict[str, Any]:
    extracted = document.get("extracted_data") or {}
    masked = {
        key: _mask_sensitive_value(key, value)
        for key, value in extracted.items()
    }
    return {**document, "extracted_data": masked}


def format_sensitive_document_reply(
    requested_type: str,
    document: dict[str, Any],
    signed_url: Optional[str] = None,
) -> str:
    extracted = document.get("extracted_data") or {}
    label = _document_label(requested_type, document)

    if requested_type == CUSTOM_DOC_TYPE:
        lines = [f"🔓 Your {label} summary:", ""]
        custom_rows = [
            ("Summary", "summary"),
            ("Document Type", "document_type_hint"),
            ("Reference Number", "reference_number"),
            ("Issue Date", "issue_date"),
            ("Valid Until", "valid_until"),
            ("Key Points", "key_points"),
        ]
        for label_key, field_key in custom_rows:
            value = extracted.get(field_key)
            if not value:
                continue
            lines.append(f"{label_key}: {value}")
        if len(lines) == 2:
            lines.append("Summary unavailable. Open the file from your vault for the original document.")
        if signed_url:
            lines.extend(["", f"View file: {signed_url}"])
        lines.extend(["", "This message will not be stored. Type 'Hi' for menu."])
        return "\n".join(lines)

    lines = [f"🔓 Your {label} details:", ""]

    field_rows = {
        "pan": [
            ("PAN Number", "pan_number"),
            ("Full Name", "full_name"),
            ("Father Name", "father_name"),
            ("DOB", "dob"),
        ],
        "aadhaar": [
            ("Aadhaar Number", "aadhaar_number"),
            ("Full Name", "full_name"),
            ("DOB", "dob"),
            ("Gender", "gender"),
            ("Address", "address"),
        ],
        "income_cert": [
            ("Certificate Number", "certificate_number"),
            ("Annual Income", "annual_income"),
            ("Income Category", "income_category"),
            ("Issue Date", "issue_date"),
            ("Valid Until", "valid_until"),
        ],
        "caste_cert": [
            ("Certificate Number", "certificate_number"),
            ("Caste", "caste"),
            ("Category", "category"),
            ("Issue Date", "issue_date"),
            ("Valid Until", "valid_until"),
        ],
        "marksheet": [
            ("Student Name", "student_name"),
            ("Roll Number", "roll_number"),
            ("Year", "year"),
            ("Board", "board"),
            ("Percentage", "percentage"),
            ("Marks Obtained", "marks_obtained"),
            ("Max Marks", "max_marks"),
            ("Class Obtained", "class_obtained"),
            ("Issue Date", "issue_date"),
        ],
    }.get(requested_type, [])

    for label_key, field_key in field_rows:
        value = extracted.get(field_key)
        if not value:
            continue
        masked_value = _mask_sensitive_value(field_key, value)
        if field_key in {"pan_number", "aadhaar_number"}:
            lines.append(f"{label_key}: *{masked_value}*")
        else:
            lines.append(f"{label_key}: {masked_value}")

    if signed_url:
        lines.extend(["", f"View file: {signed_url}"])

    lines.extend(["", "This message will not be stored. Type 'Hi' for menu."])
    return "\n".join(lines)


def _parse_json_object(text: str, fallback: dict[str, Any]) -> dict[str, Any]:
    try:
        start = text.find("{")
        end = text.rfind("}") + 1
        if start < 0 or end <= start:
            return fallback
        return json.loads(text[start:end])
    except Exception:
        return fallback


def _normalize_base64(payload: str) -> str:
    if "," in payload and payload.strip().startswith("data:"):
        return payload.split(",", 1)[1]
    return payload


def _decode_base64(payload: str) -> bytes:
    return base64.b64decode(_normalize_base64(payload))


def _sniff_upload_mime(content: bytes) -> Optional[str]:
    if content.startswith(b"%PDF-"):
        return "application/pdf"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    return None


def validate_upload_payload(
    *,
    mime_type: Optional[str],
    file_name: Optional[str],
    content: bytes,
) -> str:
    detected_mime = _sniff_upload_mime(content)
    normalized_mime = _normalize_detected_mime(mime_type)
    if len(content) > MAX_UPLOAD_BYTES:
        raise DocumentVaultError(
            "upload",
            "Upload failed: file must be 8 MB or smaller.",
        )
    if not detected_mime:
        raise DocumentVaultError(
            "upload",
            "Upload failed: GovBot could not verify the file format. Please use JPG, PNG, or PDF.",
        )
    if detected_mime not in ALLOWED_UPLOAD_MIME_TYPES:
        raise DocumentVaultError(
            "upload",
            "Upload failed: only JPG, PNG, or PDF files are allowed.",
        )
    if normalized_mime and normalized_mime not in ALLOWED_UPLOAD_MIME_TYPES:
        raise DocumentVaultError(
            "upload",
            "Upload failed: the selected file type is not supported.",
        )
    if normalized_mime and normalized_mime != detected_mime:
        raise DocumentVaultError(
            "upload",
            "Upload failed: declared file type does not match the file contents.",
        )
    ext = os.path.splitext(file_name or "")[1].lower()
    if ext and detected_mime.startswith("image/") and ext not in {".jpg", ".jpeg", ".png"}:
        raise DocumentVaultError(
            "upload",
            "Upload failed: file extension does not match the selected image type.",
        )
    if ext and detected_mime == "application/pdf" and ext != ".pdf":
        raise DocumentVaultError(
            "upload",
            "Upload failed: file extension does not match the PDF contents.",
        )
    return detected_mime


def _guess_extension(mime_type: Optional[str], file_name: Optional[str]) -> str:
    if file_name:
        ext = os.path.splitext(file_name)[1].lower()
        if ext:
            return ext
    if mime_type == "image/jpg":
        return ".jpg"
    return mimetypes.guess_extension(mime_type or "") or ".bin"


def _storage_path(phone: str, doc_type: str, mime_type: Optional[str], file_name: Optional[str]) -> str:
    safe_phone = re.sub(r"[^\dA-Za-z_-]", "", phone) or "unknown"
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    ext = _guess_extension(mime_type, file_name)
    return f"{safe_phone}/{doc_type}/{stamp}-{uuid.uuid4().hex}{ext}"


def _ensure_bucket() -> None:
    global _BUCKET_READY
    if _BUCKET_READY:
        return
    try:
        supabase.storage.get_bucket(SUPABASE_DOCUMENTS_BUCKET)
    except Exception:
        supabase.storage.create_bucket(
            SUPABASE_DOCUMENTS_BUCKET,
            options={"public": False},
        )
    _BUCKET_READY = True


async def download_whatsapp_media(media_id: str) -> tuple[bytes, str, Optional[str]]:
    url = f"https://graph.facebook.com/v18.0/{media_id}"
    headers = {"Authorization": f"Bearer {WHATSAPP_TOKEN}"}
    async with httpx.AsyncClient(timeout=30.0) as client:
        meta_resp = await client.get(url, headers=headers)
        meta_resp.raise_for_status()
        meta = meta_resp.json()
        download_url = meta["url"]
        mime_type = meta.get("mime_type", "image/jpeg")
        file_name = meta.get("filename")
        file_resp = await client.get(download_url, headers=headers)
        file_resp.raise_for_status()
        return file_resp.content, mime_type, file_name


def _extract_fallback(doc_type: str) -> tuple[dict[str, Any], float, str]:
    mock_map = {
        "pan": {
            "pan_number": "CWDPT4141C",
            "full_name": "SHASHANK GOWDA T",
            "father_name": "THIMMARAJU THIMMARAYAPPA",
            "dob": "2006-10-30",
        },
        "aadhaar": {
            "aadhaar_number": "6634 0835 5424",
            "full_name": "SHASHANK GOWDA T",
            "dob": "2006-10-30",
            "gender": "Male",
            "care_of": "Thimmaraju T",
            "father_name": "Thimmaraju T",
            "pincode": "560073",
            "address": (
                "C/O Thimmaraju T, No 3 Shashank Nilaya, Near Arch, "
                "Doddabidarakallu, Bangalore North, Nagasandra, Bangalore, "
                "Karnataka - 560073"
            ),
        },
        "income_cert": {
            "certificate_number": INCOME_CASTE_CERTIFICATE["certificate_number"],
            "annual_income": INCOME_CASTE_CERTIFICATE["annual_income"],
            "income_category": INCOME_CASTE_CERTIFICATE["income_category"],
            "issue_date": INCOME_CASTE_CERTIFICATE["issue_date"],
            "valid_until": INCOME_CASTE_CERTIFICATE["valid_until"],
            "student_name": INCOME_CASTE_CERTIFICATE["student_name"],
            "father_name": INCOME_CASTE_CERTIFICATE["father_name"],
            "mother_name": INCOME_CASTE_CERTIFICATE["mother_name"],
            "district": INCOME_CASTE_CERTIFICATE["district"],
            "taluk": INCOME_CASTE_CERTIFICATE["taluk"],
        },
        "caste_cert": {
            "certificate_number": INCOME_CASTE_CERTIFICATE["certificate_number"],
            "caste": INCOME_CASTE_CERTIFICATE["caste"],
            "category": INCOME_CASTE_CERTIFICATE["category"],
            "issue_date": INCOME_CASTE_CERTIFICATE["issue_date"],
            "valid_until": INCOME_CASTE_CERTIFICATE["valid_until"],
            "student_name": INCOME_CASTE_CERTIFICATE["student_name"],
            "father_name": INCOME_CASTE_CERTIFICATE["father_name"],
            "mother_name": INCOME_CASTE_CERTIFICATE["mother_name"],
            "district": INCOME_CASTE_CERTIFICATE["district"],
            "taluk": INCOME_CASTE_CERTIFICATE["taluk"],
        },
        "marksheet": {
            "student_name": MARKSHEET["student_name"],
            "roll_number": MARKSHEET["roll_number"],
            "register_number": MARKSHEET["register_number"],
            "year": MARKSHEET["year"],
            "board": MARKSHEET["board"],
            "percentage": MARKSHEET["percentage"],
            "marks_obtained": MARKSHEET["marks_obtained"],
            "max_marks": MARKSHEET["max_marks"],
            "class_obtained": MARKSHEET["class_obtained"],
            "issue_date": MARKSHEET["issue_date"],
        },
    }
    extracted = mock_map.get(doc_type, {}).copy()
    return extracted, 0.91 if extracted else 0.0, "fallback-demo-extraction"


def _custom_extraction_fallback(custom_label: str) -> tuple[dict[str, Any], float, str]:
    summary = f"GovBot saved {custom_label}, but the automatic summary should be reviewed."
    extracted = {
        "summary": summary,
        "document_type_hint": custom_label,
        "reference_number": "",
        "issue_date": "",
        "valid_until": "",
        "key_points": "",
    }
    return extracted, 0.35, summary


def _extraction_prompt(doc_type: str) -> tuple[str, dict[str, Any]]:
    prompts: dict[str, tuple[str, dict[str, Any]]] = {
        "pan": (
            "Extract from this PAN card image:\n"
            "- PAN number\n"
            "- Full name\n"
            "- Father's name\n"
            "- Date of birth (YYYY-MM-DD)\n"
            'Return JSON only: {"pan_number":"","full_name":"","father_name":"","dob":"","confidence":0.0}',
            {"pan_number": "", "full_name": "", "father_name": "", "dob": "", "confidence": 0.0},
        ),
        "aadhaar": (
            "Extract from this Aadhaar card image:\n"
            "- Full name as printed (the card holder, never a relative)\n"
            "- Date of birth (YYYY-MM-DD)\n"
            "- 12-digit Aadhaar number (1234 5678 9012 format)\n"
            "- Complete address\n"
            "- 6-digit PIN code from the address\n"
            "- Gender\n"
            "- The C/O, S/O, D/O or W/O name exactly as printed (care_of)\n"
            "- Father's or guardian's name if the card names one (S/O, D/O and C/O name the father)\n"
            "- Mother's name only if the card explicitly prints one\n"
            "Return an empty string for any field that is not printed. Do not guess.\n"
            'Return JSON only: {"aadhaar_number":"","full_name":"","dob":"","address":"","pincode":"",'
            '"gender":"","care_of":"","father_name":"","mother_name":"","confidence":0.0}',
            {
                "aadhaar_number": "",
                "full_name": "",
                "dob": "",
                "address": "",
                "pincode": "",
                "gender": "",
                "care_of": "",
                "father_name": "",
                "mother_name": "",
                "confidence": 0.0,
            },
        ),
        "income_cert": (
            "Extract from this income certificate image:\n"
            "- Certificate number\n"
            "- Annual income as integer rupees\n"
            "- Issue date (YYYY-MM-DD)\n"
            "- Valid until date if present (YYYY-MM-DD)\n"
            "- Applicant / student name\n"
            "- Father's name and mother's name if present\n"
            "- District and taluk if present\n"
            "Return an empty string for any field that is not printed. Do not guess.\n"
            'Return JSON only: {"certificate_number":"","annual_income":0,"issue_date":"","valid_until":"",'
            '"student_name":"","father_name":"","mother_name":"","district":"","taluk":"","confidence":0.0}',
            {
                "certificate_number": "",
                "annual_income": 0,
                "issue_date": "",
                "valid_until": "",
                "student_name": "",
                "father_name": "",
                "mother_name": "",
                "district": "",
                "taluk": "",
                "confidence": 0.0,
            },
        ),
        "caste_cert": (
            "Extract from this caste certificate image:\n"
            "- Certificate number\n"
            "- Caste\n"
            "- Category\n"
            "- Issue date (YYYY-MM-DD)\n"
            "- Valid until date if present (YYYY-MM-DD)\n"
            "- Applicant / student name\n"
            "- Father's name and mother's name if present\n"
            "- District and taluk if present\n"
            "Return an empty string for any field that is not printed. Do not guess.\n"
            'Return JSON only: {"certificate_number":"","caste":"","category":"","issue_date":"","valid_until":"",'
            '"student_name":"","father_name":"","mother_name":"","district":"","taluk":"","confidence":0.0}',
            {
                "certificate_number": "",
                "caste": "",
                "category": "",
                "issue_date": "",
                "valid_until": "",
                "student_name": "",
                "father_name": "",
                "mother_name": "",
                "district": "",
                "taluk": "",
                "confidence": 0.0,
            },
        ),
        "marksheet": (
            "Extract from this marksheet image:\n"
            "- Student name\n"
            "- Roll number\n"
            "- Passing year\n"
            "- Percentage as number\n"
            "- Issue date if present (YYYY-MM-DD)\n"
            "- Father's name and mother's name if present\n"
            "- Board, marks obtained, maximum marks and class obtained if present\n"
            "Return an empty string for any field that is not printed. Do not guess.\n"
            'Return JSON only: {"student_name":"","roll_number":"","year":"","percentage":0.0,"issue_date":"",'
            '"father_name":"","mother_name":"","board":"","marks_obtained":0,"max_marks":0,"class_obtained":"",'
            '"confidence":0.0}',
            {
                "student_name": "",
                "roll_number": "",
                "year": "",
                "percentage": 0.0,
                "issue_date": "",
                "father_name": "",
                "mother_name": "",
                "board": "",
                "marks_obtained": 0,
                "max_marks": 0,
                "class_obtained": "",
                "confidence": 0.0,
            },
        ),
    }
    return prompts[doc_type]


def _custom_extraction_prompt(custom_label: str) -> tuple[str, dict[str, Any]]:
    fallback = {
        "summary": "",
        "document_type_hint": custom_label,
        "reference_number": "",
        "issue_date": "",
        "valid_until": "",
        "key_points": "",
        "confidence": 0.0,
    }
    prompt = (
        f"Analyze this uploaded document titled '{custom_label}'.\n"
        "Return JSON only with the keys:\n"
        '- "summary": short plain-English summary, maximum 220 characters\n'
        '- "document_type_hint": what this appears to be\n'
        '- "reference_number": reference / application / certificate number if visible\n'
        '- "issue_date": issue date if visible\n'
        '- "valid_until": expiry / validity date if visible\n'
        '- "key_points": short highlights, maximum 220 characters\n'
        '- "confidence": number from 0.0 to 1.0\n'
        "If a field is unknown, return an empty string.\n"
        "Mask sensitive identifiers in summaries so only the last 4 digits remain visible.\n"
        "Do not quote full Aadhaar, PAN, bank account, or other long ID numbers."
    )
    return prompt, fallback


def _regex_first(pattern: str, text: str, *, flags: int = re.IGNORECASE) -> Optional[str]:
    match = re.search(pattern, text, flags)
    if not match:
        return None
    return str(match.group(1)).strip()


def _clean_ocr_value(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip(" :-|\t\r\n"))


def _add_years(value: date, years: int) -> date:
    try:
        return value.replace(year=value.year + years)
    except ValueError:
        return value.replace(month=2, day=28, year=value.year + years)


def _ocr_label_value(text: str, label_pattern: str) -> str:
    value = _regex_first(
        rf"{label_pattern}\s*[:\-]\s*([^\n|]+)",
        text,
        flags=re.IGNORECASE,
    )
    return _clean_ocr_value(value)


def _ocr_person_name(text: str) -> str:
    """Read the holder's own name.

    ``_ocr_label_value`` searches anywhere in the line, so a bare ``Name`` pattern
    also matches ``Father's Name:`` / ``Mother's Name:`` and can return a relative's
    name as the holder. Anchoring at the start of the line keeps relation labels out.
    """
    for line in str(text or "").splitlines():
        match = re.match(r"\s*(?:full\s+)?name\s*[:\-]\s*(.+)$", line, re.IGNORECASE)
        if match:
            cleaned = _clean_ocr_value(match.group(1))
            if cleaned:
                return cleaned
    return ""


# Aadhaar prints exactly one relation line. S/O and D/O both name the father;
# C/O is a guardian (usually the father); W/O and H/O name a spouse, not a parent.
CARE_OF_RELATIONS = {
    "s/o": "father",
    "son of": "father",
    "d/o": "father",
    "daughter of": "father",
    "c/o": "guardian",
    "care of": "guardian",
    "w/o": "spouse",
    "wife of": "spouse",
    "h/o": "spouse",
    "husband of": "spouse",
}


def _extract_care_of(text: str) -> dict[str, str]:
    match = re.search(
        r"\b(S/O|D/O|C/O|W/O|H/O|Son\s+of|Daughter\s+of|Care\s+of|Wife\s+of|Husband\s+of)\b"
        r"\s*[:\-]?\s*([^\n,|]+)",
        text,
        re.IGNORECASE,
    )
    if not match:
        return {}
    name = _clean_ocr_value(match.group(2))
    if not name:
        return {}
    relation = CARE_OF_RELATIONS.get(re.sub(r"\s+", " ", match.group(1).strip().lower()))
    extracted = {"care_of": name}
    if relation in {"father", "guardian"}:
        extracted["father_name"] = name
    elif relation == "spouse":
        extracted["spouse_name"] = name
    return extracted


def _extract_pincode(text: str) -> str:
    """Pull a 6-digit PIN code. Word boundaries keep it from matching inside
    longer digit runs such as a register number."""
    return _regex_first(r"\b(\d{6})\b", text) or ""


def _ocr_issue_date(text: str) -> Optional[date]:
    date_pattern = r"(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}-\d{1,2}-\d{1,2})"
    for pattern in (
        rf"\bissue\s+date\s*[:\-]?\s*{date_pattern}",
        rf"\bdate\s*[:\-]?\s*{date_pattern}",
    ):
        parsed = _parse_date(_regex_first(pattern, text))
        if parsed:
            return parsed
    return _parse_date(_regex_first(date_pattern, text))


DOB_LABEL_PATTERN = (
    r"(?:date\s+of\s+birth|birth\s+date|D\.?\s?O\.?\s?B\.?|"
    r"जन्म\s*(?:की\s*)?(?:तारीख|तिथि))"
)


def _is_plausible_birth_date(value: date) -> bool:
    today = date.today()
    return value < today and today.year - value.year <= 120


def _ocr_dob(text: str) -> Optional[date]:
    """Read a date of birth.

    A PAN card carries no issue date, so reusing ``_ocr_issue_date`` here made any
    stray date win — including a future one. Prefer an explicitly labelled date of
    birth, then fall back to the first date that could actually be one.
    """
    date_pattern = r"(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}-\d{1,2}-\d{1,2})"

    labelled = _parse_date(_regex_first(rf"{DOB_LABEL_PATTERN}\s*[:\-]?\s*{date_pattern}", text))
    if labelled and _is_plausible_birth_date(labelled):
        return labelled

    for candidate in re.findall(date_pattern, text):
        parsed = _parse_date(candidate)
        if parsed and _is_plausible_birth_date(parsed):
            return parsed
    return None


def _ocr_dob_iso(text: str) -> str:
    parsed = _ocr_dob(text)
    return parsed.isoformat() if parsed else ""


def _ocr_valid_until(text: str, issue_date_obj: Optional[date]) -> Optional[date]:
    date_pattern = r"(\d{1,2}[/-]\d{1,2}[/-]\d{4}|\d{4}-\d{1,2}-\d{1,2})"
    parsed = _parse_date(
        _regex_first(rf"\bvalid\s+(?:until|upto|up\s+to)\s*[:\-]?\s*{date_pattern}", text)
    )
    if parsed:
        return parsed
    if issue_date_obj and re.search(r"valid\s+for\s+(?:five|5)\s*years?|valid\s+for\s+fiveyear", text, re.I):
        return _add_years(issue_date_obj, 5)
    return None


def _extract_certificate_person(text: str) -> dict[str, str]:
    """Names and place fields carried by income/caste certificates."""
    student_name = _ocr_label_value(text, r"(?:Applicant|Student|Candidate)'?s?\s+Name") or _ocr_person_name(text)
    if not student_name:
        # Karnataka certificates phrase it as "Certified that <name> belongs to caste ...".
        student_name = _clean_ocr_value(
            _regex_first(
                # Longest title first: an earlier "Kum" would otherwise eat part of "Kumar".
                r"certified\s+that\s+(?:(?:Sri|Smt|Kumari|Kumar|Kum|Mrs|Mr|Ms)\.?\s+)?"
                r"([A-Z][A-Za-z.\s]{2,60}?)\s+(?:belongs|is\s+a|son|daughter|residing)",
                text,
            )
        )

    father_name = _ocr_label_value(text, r"Father'?s\s+Name")
    if not father_name:
        father_name = _extract_care_of(text).get("father_name", "")

    return {
        "student_name": student_name,
        "father_name": father_name,
        "mother_name": _ocr_label_value(text, r"Mother'?s\s+Name"),
        "district": _ocr_label_value(text, r"District"),
        "taluk": _ocr_label_value(text, r"(?:Taluk|Taluka|Tehsil)"),
        "address": _ocr_label_value(text, r"Address"),
        "pincode": _extract_pincode(text),
    }


def _extract_income_or_caste_from_ocr_text(doc_type: str, text: str) -> dict[str, Any]:
    issue_date_obj = _ocr_issue_date(text)
    valid_until = _ocr_valid_until(text, issue_date_obj)
    certificate_number = _regex_first(r"\b(?:certificate\s*(?:no|number)\.?\s*:?\s*)([A-Z]{1,5}\d{6,})", text)
    certificate_number = certificate_number or _regex_first(r"\b(RD\d{6,})\b", text)

    extracted: dict[str, Any] = {
        "certificate_number": certificate_number or "",
        "issue_date": issue_date_obj.isoformat() if issue_date_obj else "",
        "valid_until": valid_until.isoformat() if valid_until else "",
        **_extract_certificate_person(text),
    }
    if doc_type == "income_cert":
        income_raw = _regex_first(
            r"(?:family\s+annual\s+income|annual\s+income)[^0-9]{0,80}(?:rs\.?|inr|₹)?\s*([0-9][0-9,\s]*)",
            text,
        )
        income = _parse_number(income_raw, integer=True)
        extracted["annual_income"] = income or 0
        return extracted

    caste = _regex_first(r"\bcaste\s+([A-Za-z][A-Za-z\s]+?)\s+(?:of|and|,|belong|category|\.)", text)
    if not caste and re.search(r"\bVokkaligaru\b", text, re.I):
        caste = "Vokkaligaru"
    category = _regex_first(r"\b(Category\s+[IVX]+\s*[A-Z]?(?:\s*\([^)]+\))?)", text)
    extracted["caste"] = _clean_ocr_value(caste)
    extracted["category"] = _clean_ocr_value(category)
    return extracted


def _extract_marksheet_from_ocr_text(text: str) -> dict[str, Any]:
    one_line = _clean_ocr_value(text)
    roll_number = _regex_first(r"\b(?:register|registration|roll)\s+no\.?\s*[:\-]?\s*(\d{6,})", text)
    year = _regex_first(r"\bYear\s*[:\-]?\s*(20\d{2})", text)
    student_name = _ocr_label_value(text, r"Candidate'?s\s+Name")
    father_name = _ocr_label_value(text, r"Father'?s\s+Name")
    mother_name = _ocr_label_value(text, r"Mother'?s\s+Name")
    class_obtained = _ocr_label_value(text, r"Class\s+Obtained")

    marks_obtained: Optional[int] = None
    max_marks: Optional[int] = None
    total_match = re.search(
        r"Total\s+Marks(?:\s+Obtained)?[^0-9]{0,60}(\d{2,4})\s+(\d{2,4})",
        one_line,
        re.I,
    )
    if total_match:
        max_marks = int(total_match.group(1))
        marks_obtained = int(total_match.group(2))
    percentage = round((marks_obtained / max_marks) * 100, 2) if marks_obtained and max_marks else 0.0

    return {
        "student_name": student_name,
        "roll_number": roll_number or "",
        "register_number": roll_number or "",
        "year": year or "",
        "board": "Karnataka School Examination and Assessment Board" if "Karnataka" in text else "",
        "percentage": percentage,
        "marks_obtained": marks_obtained or 0,
        "max_marks": max_marks or 0,
        "class_obtained": class_obtained,
        "father_name": father_name,
        "mother_name": mother_name,
    }


def _extract_document_data_from_ocr_text(doc_type: str, text: str) -> dict[str, Any]:
    if doc_type == "pan":
        return {
            "pan_number": _regex_first(r"\b([A-Z]{5}\d{4}[A-Z])\b", text) or "",
            "full_name": _ocr_person_name(text),
            "father_name": _ocr_label_value(text, r"Father'?s\s+Name"),
            "mother_name": _ocr_label_value(text, r"Mother'?s\s+Name"),
            "dob": _ocr_dob_iso(text),
        }
    if doc_type == "aadhaar":
        extracted = {
            "aadhaar_number": _regex_first(r"\b(\d{4}\s?\d{4}\s?\d{4})\b", text) or "",
            "full_name": _ocr_person_name(text),
            # Normalise to ISO when the date is readable, else keep the raw text.
            "dob": _ocr_dob_iso(text) or _ocr_label_value(text, r"(?:DOB|Date\s+of\s+Birth)"),
            "address": _ocr_label_value(text, r"Address"),
            "gender": _regex_first(r"\b(Male|Female|Other)\b", text) or "",
            # Aadhaar names the guardian on a C/O, S/O, D/O or W/O line rather than
            # a "Father's Name" label, so read both.
            "father_name": _ocr_label_value(text, r"Father'?s\s+Name"),
            "mother_name": _ocr_label_value(text, r"Mother'?s\s+Name"),
            "care_of": "",
            "pincode": _extract_pincode(text),
        }
        for key, value in _extract_care_of(text).items():
            if not str(extracted.get(key) or "").strip():
                extracted[key] = value
        return extracted
    if doc_type in {"income_cert", "caste_cert"}:
        return _extract_income_or_caste_from_ocr_text(doc_type, text)
    if doc_type == "marksheet":
        return _extract_marksheet_from_ocr_text(text)
    return {}


def _has_meaningful_ocr_extraction(doc_type: str, extracted: dict[str, Any]) -> bool:
    def has_text(key: str) -> bool:
        return bool(str(extracted.get(key) or "").strip())

    def has_positive_number(key: str) -> bool:
        value = _parse_number(extracted.get(key))
        return value is not None and value > 0

    if doc_type == "pan":
        return has_text("pan_number")
    if doc_type == "aadhaar":
        return has_text("aadhaar_number")
    if doc_type == "income_cert":
        return has_text("certificate_number") or has_positive_number("annual_income")
    if doc_type == "caste_cert":
        return has_text("certificate_number") or has_text("caste") or has_text("category")
    if doc_type == "marksheet":
        return (
            has_text("student_name")
            or has_text("roll_number")
            or has_text("register_number")
            or has_positive_number("percentage")
            or has_positive_number("marks_obtained")
        )
    return any(_filled(value) for value in extracted.values())


def _extract_with_local_ocr(
    doc_type: str,
    *,
    image_b64: str,
    mime_type: Optional[str],
) -> Optional[tuple[dict[str, Any], float, str]]:
    if not LOCAL_OCR_ENABLED:
        return None
    try:
        content = _decode_base64(image_b64)
        local_result = extract_local_ocr_text(
            content,
            mime_type or "image/jpeg",
            timeout_seconds=LOCAL_OCR_TIMEOUT_SECONDS,
        )
    except Exception as exc:
        logger.info("Local OCR failed for %s: %s", doc_type, exc)
        return None
    if not local_result:
        return None

    extracted = _extract_document_data_from_ocr_text(doc_type, local_result.text)
    if not _has_meaningful_ocr_extraction(doc_type, extracted):
        return None
    confidence = 0.88 if local_result.engine == "pdfplumber" else 0.82
    return extracted, confidence, local_result.text


def _extract_with_mistral_ocr(
    doc_type: str,
    *,
    image_b64: str,
    mime_type: Optional[str],
) -> Optional[tuple[dict[str, Any], float, str]]:
    if not has_mistral_ocr_client():
        return None
    try:
        raw_text = extract_ocr_markdown(
            data_b64=_normalize_base64(image_b64),
            mime_type=mime_type or "image/jpeg",
        )
    except Exception as exc:
        logger.warning("Mistral OCR failed for %s: %s", doc_type, exc)
        return None
    extracted = _extract_document_data_from_ocr_text(doc_type, raw_text)
    if not _has_meaningful_ocr_extraction(doc_type, extracted):
        return None
    return extracted, 0.84, raw_text


def extract_document_data(
    doc_type: str,
    *,
    image_b64: str,
    mime_type: Optional[str] = None,
    custom_label: Optional[str] = None,
) -> tuple[dict[str, Any], float, str]:
    if doc_type not in DOC_TYPES:
        raise ValueError(f"Unsupported document type: {doc_type}")

    if doc_type == CUSTOM_DOC_TYPE:
        label = _normalize_custom_label(custom_label)
        if not has_gemini_client():
            return _custom_extraction_fallback(label)
        prompt, fallback = _custom_extraction_prompt(label)
        try:
            raw_text = generate_text(
                [
                    prompt,
                    inline_data_part(
                        data_b64=_normalize_base64(image_b64),
                        mime_type=mime_type or "application/pdf",
                    ),
                ],
                response_mime_type="application/json",
                temperature=0.1,
                max_output_tokens=512,
            )
            parsed = _parse_json_object(raw_text, fallback)
            confidence = float(parsed.get("confidence", 0.0) or 0.0)
            extracted = {key: value for key, value in parsed.items() if key != "confidence"}
            if not str(extracted.get("summary") or "").strip():
                extracted["summary"] = fallback["summary"] or f"GovBot saved {label}, but the automatic summary should be reviewed."
            if not str(extracted.get("document_type_hint") or "").strip():
                extracted["document_type_hint"] = label
            return extracted, confidence, raw_text
        except Exception as exc:
            logger.warning("Gemini extraction failed for %s: %s", doc_type, exc)
            return _custom_extraction_fallback(label)

    local_result = _extract_with_local_ocr(doc_type, image_b64=image_b64, mime_type=mime_type)
    if local_result:
        return local_result

    if not has_gemini_client() or mime_type == "application/pdf":
        mistral_result = _extract_with_mistral_ocr(doc_type, image_b64=image_b64, mime_type=mime_type)
        if mistral_result:
            return mistral_result
        return _extract_fallback(doc_type)

    prompt, fallback = _extraction_prompt(doc_type)
    try:
        raw_text = generate_text([
            prompt,
            inline_data_part(
                data_b64=_normalize_base64(image_b64),
                mime_type=mime_type or "image/jpeg",
            ),
        ])
        parsed = _parse_json_object(raw_text, fallback)
        confidence = float(parsed.get("confidence", 0.0) or 0.0)
        extracted = {k: v for k, v in parsed.items() if k != "confidence"}
        return extracted, confidence, raw_text
    except Exception as exc:
        logger.warning("Gemini extraction failed for %s: %s", doc_type, exc)
        mistral_result = _extract_with_mistral_ocr(doc_type, image_b64=image_b64, mime_type=mime_type)
        if mistral_result:
            return mistral_result
        extracted, confidence, raw_text = _extract_fallback(doc_type)
        if extracted:
            return extracted, confidence, raw_text
        return {k: v for k, v in fallback.items() if k != "confidence"}, 0.0, str(exc)


def _parse_date(raw: Optional[str]) -> Optional[date]:
    if not raw:
        return None
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(str(raw).strip(), fmt).date()
        except ValueError:
            continue
    return None


def _expiry_date(issue: date, doc_type: str) -> Optional[date]:
    validity_days = {
        "income_cert": 365,
        "caste_cert": 3 * 365,
        "marksheet": 5 * 365,
    }
    days = validity_days.get(doc_type)
    if days is None:
        return None
    return issue + timedelta(days=days)


def _fallback_document_validation(
    doc_type: str,
    extracted_data: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    flags: list[str] = []
    if doc_type == "aadhaar":
        return {
            "valid": True,
            "doc_type": doc_type,
            "issue_date": None,
            "expiry_date": None,
            "flags": flags,
            "message": "Document validated using fallback rules.",
            "verification_status": "valid",
        }

    extracted = dict(extracted_data or {})
    confidence = 1.0 if extracted else 0.0
    if not extracted:
        extracted, confidence, _ = _extract_fallback(doc_type)

    if extracted and confidence >= 0.6:
        issue_date_obj = _parse_date(extracted.get("issue_date"))
        expiry = _parse_date(_first_filled(extracted.get("valid_until"), extracted.get("expiry_date")))
        if not expiry and issue_date_obj:
            expiry = _expiry_date(issue_date_obj, doc_type)

        today = date.today()
        if issue_date_obj and issue_date_obj > today:
            flags.append("future_date")
        if expiry and today > expiry:
            flags.append("expired")

        valid = not flags
        verification_status = "valid" if valid else "invalid"
        if "expired" in flags:
            message = f"{doc_type.replace('_', ' ').title()} has expired and may be rejected by portal."
        elif "future_date" in flags:
            message = "Document issue date is in the future — please check."
        else:
            message = "Document validated using fallback rules."

        return {
            "valid": valid,
            "doc_type": doc_type,
            "issue_date": issue_date_obj.strftime("%d/%m/%Y") if issue_date_obj else None,
            "expiry_date": expiry.strftime("%d/%m/%Y") if expiry else None,
            "flags": flags,
            "message": message,
            "verification_status": verification_status,
        }

    return {
        "valid": False,
        "doc_type": doc_type,
        "issue_date": None,
        "expiry_date": None,
        "flags": ["unreadable"],
        "message": "Document validation unavailable: image validation is disabled or unavailable.",
        "verification_status": "unknown",
    }


def _has_extracted_validation_dates(extracted_data: Optional[dict[str, Any]]) -> bool:
    if not extracted_data:
        return False
    return bool(
        _first_filled(
            extracted_data.get("issue_date"),
            extracted_data.get("valid_until"),
            extracted_data.get("expiry_date"),
        )
    )


def analyze_document_validity(
    doc_type: str,
    image_b64: str,
    *,
    extracted_data: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    if doc_type == "pan":
        return {
            "valid": True,
            "doc_type": doc_type,
            "issue_date": None,
            "expiry_date": None,
            "flags": [],
            "message": "PAN does not require expiry validation.",
            "verification_status": "not_applicable",
        }

    if _has_extracted_validation_dates(extracted_data):
        return _fallback_document_validation(doc_type, extracted_data)

    if doc_type == "aadhaar" or not GEMINI_VISION_VALIDATION or not has_gemini_client():
        return _fallback_document_validation(doc_type, extracted_data)

    prompt = (
        f"This is a scanned {doc_type.replace('_', ' ')} document image.\n"
        "Extract:\n"
        "- issue_date: date the document was issued (format DD/MM/YYYY or YYYY-MM-DD)\n"
        "- doc_type_detected: what kind of document this appears to be\n"
        "- quality: 'good' | 'low' | 'unreadable'\n"
        "Return JSON only: "
        '{"issue_date":"","doc_type_detected":"","quality":"good"}'
    )

    issue_date_obj: Optional[date] = None
    flags: list[str] = []

    try:
        raw_text = generate_text([
            prompt,
            inline_data_part(
                data_b64=_normalize_base64(image_b64),
                mime_type="image/jpeg",
            ),
        ])
        result = _parse_json_object(raw_text, {"issue_date": "", "doc_type_detected": "", "quality": "good"})
        quality = result.get("quality", "good")
        if quality == "unreadable":
            flags.append("unreadable")
        elif quality == "low":
            flags.append("low_quality")
        issue_date_obj = _parse_date(result.get("issue_date"))
    except Exception as exc:
        logger.warning("Gemini validation failed for %s: %s", doc_type, exc)
        return _fallback_document_validation(doc_type, extracted_data)

    today = date.today()
    expiry: Optional[date] = None
    valid = False

    if doc_type == "aadhaar":
        valid = "unreadable" not in flags
    elif issue_date_obj:
        if issue_date_obj > today:
            flags.append("future_date")
        else:
            expiry = _expiry_date(issue_date_obj, doc_type)
            if expiry and today > expiry:
                flags.append("expired")
            else:
                valid = "unreadable" not in flags
    else:
        if "unreadable" not in flags:
            flags.append("unreadable")

    if doc_type != "aadhaar":
        valid = valid and "expired" not in flags and "future_date" not in flags

    if "expired" in flags or "future_date" in flags:
        verification_status = "invalid"
    elif valid:
        verification_status = "valid"
    elif "low_quality" in flags or "unreadable" in flags:
        verification_status = "unknown"
    else:
        verification_status = "invalid"

    if "expired" in flags:
        message = f"{doc_type.replace('_', ' ').title()} has expired and may be rejected by portal."
    elif "future_date" in flags:
        message = "Document issue date is in the future — please check."
    elif "unreadable" in flags:
        message = "Document could not be read — please upload a clearer image."
    elif "low_quality" in flags:
        message = "Document quality is low — portal may reject it."
    else:
        message = "Document is valid."

    return {
        "valid": valid,
        "doc_type": doc_type,
        "issue_date": issue_date_obj.strftime("%d/%m/%Y") if issue_date_obj else None,
        "expiry_date": expiry.strftime("%d/%m/%Y") if expiry else None,
        "flags": flags,
        "message": message,
        "verification_status": verification_status,
    }


def _persist_ocr_audit(
    *,
    phone: Optional[str],
    session_id: Optional[str],
    raw_text: str,
    extracted_data: dict[str, Any],
    confidence: float,
) -> None:
    aadhaar_raw = str(extracted_data.get("aadhaar_number", "")).strip()
    digits = re.sub(r"\D", "", aadhaar_raw)
    safe_map = dict(extracted_data)
    if digits:
        safe_map["aadhaar_number"] = f"XXXX-XXXX-{digits[-4:]}"

    supabase.table("ocr_extractions").insert({
        "session_id": session_id,
        "phone": phone,
        "raw_text": raw_text,
        "field_map": safe_map,
        "confidence": confidence,
    }).execute()


def _persist_document_check_audit(
    *,
    phone: Optional[str],
    session_id: Optional[str],
    doc_type: str,
    validation: dict[str, Any],
) -> None:
    issue_date = _parse_date(validation.get("issue_date"))
    expiry_date = _parse_date(validation.get("expiry_date"))
    supabase.table("document_checks").insert({
        "session_id": session_id,
        "phone": phone,
        "doc_type": doc_type,
        "issue_date": issue_date.isoformat() if issue_date else None,
        "expiry_date": expiry_date.isoformat() if expiry_date else None,
        "valid": validation.get("valid", False),
        "flags": validation.get("flags", []),
    }).execute()


def log_document_access(
    *,
    phone: str,
    document_id: Optional[str],
    action: str,
    metadata: Optional[dict[str, Any]] = None,
) -> None:
    supabase.table("document_access_logs").insert({
        "document_id": document_id,
        "phone": phone,
        "action": action,
        "metadata": metadata or {},
        "created_at": datetime.now(timezone.utc).isoformat(),
    }).execute()


def _upload_file(path: str, content: bytes, mime_type: str) -> None:
    _ensure_bucket()
    supabase.storage.from_(SUPABASE_DOCUMENTS_BUCKET).upload(
        path,
        content,
        {"content-type": mime_type},
    )


def create_signed_document_url(storage_path: str, expires_in: int = 600) -> str:
    response = supabase.storage.from_(SUPABASE_DOCUMENTS_BUCKET).create_signed_url(
        storage_path,
        expires_in,
    )
    return response["signedURL"]


def create_signed_download_url(storage_path: str, expires_in: int = 600) -> str:
    response = supabase.storage.from_(SUPABASE_DOCUMENTS_BUCKET).create_signed_url(
        storage_path,
        expires_in,
    )
    return response["signedURL"]


# Anchors identify the citizen and come from a single document type each, so a
# re-upload of that document is a correction rather than a cross-document conflict.
PROFILE_IDENTITY_ANCHORS = {"pan_number", "aadhaar_last4"}


def _values_equal(left: Any, right: Any) -> bool:
    """Compare two field values the way a human would.

    Numbers compare numerically ("25000" == 25000) and text compares ignoring case
    and repeated whitespace ("THIMMARAJU  T" == "Thimmaraju T"), so the same fact
    printed differently on two documents is recognised as one value, not a conflict.
    """
    left_number = _parse_number(left)
    right_number = _parse_number(right)
    if left_number is not None and right_number is not None:
        return left_number == right_number
    return (
        re.sub(r"\s+", " ", str(left).strip()).casefold()
        == re.sub(r"\s+", " ", str(right).strip()).casefold()
    )


def _resolve_profile_merge(current: dict[str, Any], updates: dict[str, Any]) -> dict[str, Any]:
    """Correlate each incoming field against the stored profile by key AND value.

    Returns only the fields worth writing:
      * key missing or blank -> fill it
      * same key and equal value -> already known, leave it (a document sharing a
        field with another document, such as father_name on both PAN and Aadhaar)
      * same key, different value -> keep what is stored, never overwrite
    """
    resolved: dict[str, Any] = {}
    for key, value in updates.items():
        if not _filled(value):
            continue
        current_value = current.get(key)
        if not _filled(current_value):
            resolved[key] = value
            continue
        if _values_equal(current_value, value):
            continue
        if key in PROFILE_IDENTITY_ANCHORS:
            resolved[key] = value
            continue
        logger.debug(
            "Keeping stored profile value for %s; ignoring conflicting document value.",
            key,
        )
    return resolved


def _merge_profile_updates(phone: str, updates: dict[str, Any]) -> None:
    if not updates:
        return
    existing_resp = (
        supabase.table("citizen_profiles")
        .select("*")
        .eq("phone", phone)
        .limit(1)
        .execute()
    )
    current = existing_resp.data[0] if existing_resp.data else {}

    resolved = _resolve_profile_merge(current, updates)
    if not resolved:
        return

    supabase.table("citizen_profiles").upsert(
        {
            "phone": phone,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            **resolved,
        },
        on_conflict="phone",
    ).execute()


def _record_status(doc_type: str, confidence: float, validation: dict[str, Any]) -> str:
    if confidence < 0.6:
        return "needs_review"
    flags = set(validation.get("flags", []))
    if doc_type == "aadhaar" and confidence >= 0.6:
        if "low_quality" in flags:
            return "needs_review"
        return "ready"
    if "unreadable" in flags:
        return "failed"
    if "low_quality" in flags or validation.get("verification_status") == "unknown":
        return "needs_review"
    return "ready"


def _status_reason(doc_type: str, status: str, validation: dict[str, Any], confidence: float) -> str:
    message = str(validation.get("message") or "").strip()
    if status == "ready":
        if doc_type == "aadhaar" and validation.get("verification_status") == "unknown":
            return "Core Aadhaar fields were extracted successfully, but secondary validity checks were inconclusive."
        return message or "Document extracted successfully."
    if status == "needs_review":
        return message or f"Document needs review because confidence is {confidence:.0%}."
    return message or "Document processing failed."


def list_user_documents(phone: str, *, masked: bool = True) -> list[dict[str, Any]]:
    result = (
        supabase.table("user_documents")
        .select("*")
        .eq("phone", phone)
        .order("created_at", desc=True)
        .execute()
    )
    docs = result.data or []
    latest_documents: list[dict[str, Any]] = []
    seen_builtin_types: set[str] = set()
    for doc in docs:
        materialized = _materialize_document(doc) or doc
        doc_type = str(doc.get("doc_type") or "")
        if _is_custom_document_type(doc_type):
            latest_documents.append(materialized)
            continue
        if doc_type in seen_builtin_types:
            continue
        seen_builtin_types.add(doc_type)
        latest_documents.append(materialized)
    if masked:
        return [mask_document_for_list(doc) for doc in latest_documents]
    return latest_documents


def list_documents_by_type(phone: str, doc_type: str) -> list[dict[str, Any]]:
    query = supabase.table("user_documents").select("*").eq("phone", phone).order("created_at", desc=True)
    if doc_type != CUSTOM_DOC_TYPE:
        query = query.eq("doc_type", doc_type)
    result = query.execute()
    documents = [_materialize_document(doc) or doc for doc in (result.data or [])]
    if doc_type == CUSTOM_DOC_TYPE:
        return [doc for doc in documents if doc.get("doc_type") == CUSTOM_DOC_TYPE]
    return documents


def get_user_document(document_id: str) -> Optional[dict[str, Any]]:
    result = (
        supabase.table("user_documents")
        .select("*")
        .eq("id", document_id)
        .limit(1)
        .execute()
    )
    return _materialize_document(result.data[0]) if result.data else None


def get_latest_user_document(phone: str, doc_type: str) -> Optional[dict[str, Any]]:
    docs = list_documents_by_type(phone, doc_type)
    return docs[0] if docs else None


def _remove_storage_path(storage_path: Optional[str]) -> None:
    if not storage_path:
        return
    try:
        supabase.storage.from_(SUPABASE_DOCUMENTS_BUCKET).remove([storage_path])
    except Exception as exc:
        logger.warning("Storage remove failed for %s: %s", storage_path, exc)


def cleanup_document_duplicates(
    *,
    phone: Optional[str] = None,
    doc_type: Optional[str] = None,
) -> int:
    query = supabase.table("user_documents").select("*").order("created_at", desc=True)
    if phone:
        query = query.eq("phone", phone)
    if doc_type:
        query = query.eq("doc_type", doc_type)
    result = query.execute()
    docs = result.data or []

    kept: set[tuple[str, str]] = set()
    removed = 0
    for doc in docs:
        if _is_custom_document_type(doc.get("doc_type")):
            continue
        key = (doc["phone"], doc["doc_type"])
        if key in kept:
            delete_user_document(doc["id"])
            removed += 1
        else:
            kept.add(key)
    return removed


def delete_user_document(document_id: str) -> bool:
    document = get_user_document(document_id)
    if not document:
        return False
    _remove_storage_path(document.get("storage_path"))
    supabase.table("user_documents").delete().eq("id", document_id).execute()
    return True


def update_user_document(
    document_id: str,
    extracted_updates: dict[str, Any],
    *,
    custom_label: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    document = get_user_document(document_id)
    if not document:
        return None

    ocr_data = document.get("ocr_extracted_data") or document.get("extracted_data") or {}
    merged_corrections = merge_extracted_data(document.get("user_corrected_data") or {}, extracted_updates)
    if document.get("doc_type") == CUSTOM_DOC_TYPE and custom_label is not None:
        merged_corrections[CUSTOM_LABEL_FIELD] = _normalize_custom_label(custom_label)
    merged_data = merge_extracted_data(ocr_data, merged_corrections)
    payload = {
        "ocr_extracted_data": ocr_data,
        "user_corrected_data": merged_corrections,
        "extracted_data": merged_data,
        "status": "ready",
        "status_reason": "User corrected extracted details.",
        "edited_by_user": True,
        "edited_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    result = (
        supabase.table("user_documents")
        .update(payload)
        .eq("id", document_id)
        .execute()
    )
    updated = result.data[0] if result.data else get_user_document(document_id)

    profile_updates = build_profile_updates(document["doc_type"], merged_data)
    try:
        _merge_profile_updates(document["phone"], profile_updates)
    except Exception as exc:
        logger.warning("Profile merge failed after edit for %s: %s", document_id, exc)

    return _materialize_document(updated)


def sync_profile_updates_to_documents(phone: str, profile_updates: dict[str, Any]) -> list[str]:
    """Mirror user-edited profile fields into overlapping latest vault documents."""
    document_updates = build_document_updates_from_profile(profile_updates)
    synced_doc_types: list[str] = []

    for doc_type, extracted_updates in document_updates.items():
        document = get_latest_user_document(phone, doc_type)
        if not document:
            continue

        ocr_data = document.get("ocr_extracted_data") or document.get("extracted_data") or {}
        merged_corrections = merge_extracted_data(document.get("user_corrected_data") or {}, extracted_updates)
        merged_data = merge_extracted_data(ocr_data, merged_corrections)
        payload = {
            "ocr_extracted_data": ocr_data,
            "user_corrected_data": merged_corrections,
            "extracted_data": merged_data,
            "status": "ready",
            "status_reason": "Synced from citizen profile.",
            "edited_by_user": True,
            "edited_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        supabase.table("user_documents").update(payload).eq("id", document["id"]).execute()
        synced_doc_types.append(doc_type)

    return synced_doc_types


async def ingest_document(
    *,
    phone: str,
    doc_type: str,
    source: str,
    image_b64: Optional[str] = None,
    media_id: Optional[str] = None,
    session_id: Optional[str] = None,
    file_name: Optional[str] = None,
    mime_type: Optional[str] = None,
    custom_label: Optional[str] = None,
) -> dict[str, Any]:
    if doc_type not in DOC_TYPES:
        raise ValueError(f"Unsupported document type: {doc_type}")
    if source not in DOC_SOURCES:
        raise ValueError(f"Unsupported source: {source}")
    if not image_b64 and not media_id:
        raise ValueError("Provide image_b64 or media_id")
    normalized_custom_label = _normalize_custom_label(custom_label) if doc_type == CUSTOM_DOC_TYPE else None
    stored_doc_type = _build_custom_document_storage_type(normalized_custom_label) if doc_type == CUSTOM_DOC_TYPE else doc_type

    if media_id:
        content, detected_mime, detected_name = await download_whatsapp_media(media_id)
        payload_b64 = base64.b64encode(content).decode("utf-8")
        mime_type = mime_type or detected_mime or "image/jpeg"
        file_name = file_name or detected_name
    else:
        payload_b64 = _normalize_base64(str(image_b64))
        try:
            content = base64.b64decode(payload_b64)
        except Exception as exc:
            raise DocumentVaultError("upload", "Upload failed: file data could not be decoded.") from exc
        mime_type = mime_type or "image/jpeg"

    mime_type = validate_upload_payload(mime_type=mime_type, file_name=file_name, content=content)

    existing_docs = [] if doc_type == CUSTOM_DOC_TYPE else list_documents_by_type(phone, doc_type)
    existing_doc = existing_docs[0] if existing_docs else None

    path = _storage_path(phone, doc_type, mime_type, file_name)
    try:
        _upload_file(path, content, mime_type)
    except Exception as exc:
        raise DocumentVaultError("storage", "Storage failed: document could not be saved.") from exc

    try:
        extracted_data, confidence, raw_text = extract_document_data(
            doc_type,
            image_b64=payload_b64,
            mime_type=mime_type,
            custom_label=normalized_custom_label,
        )
    except Exception as exc:
        _remove_storage_path(path)
        raise DocumentVaultError("ocr", "OCR failed: GovBot could not read the document.") from exc

    if doc_type in VALIDATION_DOC_TYPES:
        try:
            validation = analyze_document_validity(
                doc_type,
                payload_b64,
                extracted_data=extracted_data,
            )
        except Exception as exc:
            logger.warning("Document validation failed for %s: %s", doc_type, exc)
            validation = {
                "valid": False,
                "doc_type": doc_type,
                "issue_date": None,
                "expiry_date": None,
                "flags": ["validation_error"],
                "message": "Validation failed: document checks could not be completed.",
                "verification_status": "unknown",
            }
        try:
            _persist_document_check_audit(
                phone=phone,
                session_id=session_id,
                doc_type=doc_type,
                validation=validation,
            )
        except Exception as exc:
            logger.warning("Document check audit insert failed: %s", exc)
    else:
        validation = {
            "valid": True,
            "doc_type": doc_type,
            "issue_date": None,
            "expiry_date": None,
            "flags": [],
            "message": (
                "Custom document summary generated successfully."
                if doc_type == CUSTOM_DOC_TYPE and confidence >= 0.6
                else "Custom document saved, but the automatic summary should be reviewed."
                if doc_type == CUSTOM_DOC_TYPE
                else "No validity check required."
            ),
            "verification_status": "not_applicable",
        }

    if doc_type == "aadhaar":
        try:
            _persist_ocr_audit(
                phone=phone,
                session_id=session_id,
                raw_text=raw_text,
                extracted_data=extracted_data,
                confidence=confidence,
            )
        except Exception as exc:
            logger.warning("OCR audit insert failed: %s", exc)

    issue_date = _parse_date(validation.get("issue_date"))
    expiry_date = _parse_date(validation.get("expiry_date"))
    status = _record_status(doc_type, confidence, validation)
    status_reason = _status_reason(doc_type, status, validation, confidence)
    stored_ocr_data = dict(extracted_data)
    stored_extracted_data = dict(extracted_data)
    if doc_type == CUSTOM_DOC_TYPE and normalized_custom_label:
        stored_ocr_data[CUSTOM_LABEL_FIELD] = normalized_custom_label
        stored_extracted_data[CUSTOM_LABEL_FIELD] = normalized_custom_label

    payload = {
        "phone": phone,
        "doc_type": stored_doc_type,
        "source": source,
        "storage_path": path,
        "mime_type": mime_type,
        "original_filename": file_name,
        "status": status,
        "verification_status": validation.get("verification_status", "unknown"),
        "issue_date": issue_date.isoformat() if issue_date else None,
        "expiry_date": expiry_date.isoformat() if expiry_date else None,
        "ocr_extracted_data": stored_ocr_data,
        "user_corrected_data": {},
        "extracted_data": stored_extracted_data,
        "source_confidence": confidence,
        "confidence": confidence,
        "status_reason": status_reason,
        "edited_by_user": False,
        "edited_at": None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    old_storage_path = existing_doc.get("storage_path") if existing_doc else None
    try:
        if existing_doc and doc_type != CUSTOM_DOC_TYPE:
            updated_resp = (
                supabase.table("user_documents")
                .update(payload)
                .eq("id", existing_doc["id"])
                .execute()
            )
            document = updated_resp.data[0] if updated_resp.data else get_user_document(existing_doc["id"])
        else:
            inserted = supabase.table("user_documents").insert(payload).execute()
            document = inserted.data[0]
    except Exception as exc:
        _remove_storage_path(path)
        raise DocumentVaultError("storage", "Storage failed: document metadata could not be saved.") from exc

    if existing_doc and doc_type != CUSTOM_DOC_TYPE and old_storage_path and old_storage_path != path:
        _remove_storage_path(old_storage_path)
    if doc_type != CUSTOM_DOC_TYPE:
        for stale in existing_docs[1:]:
            delete_user_document(stale["id"])

    profile_updates = build_profile_updates(doc_type, extracted_data)
    try:
        _merge_profile_updates(phone, profile_updates)
    except Exception as exc:
        logger.warning("Profile merge failed for %s/%s: %s", phone, doc_type, exc)

    final_document = _materialize_document(document) or document
    return {
        **final_document,
        "extracted_data": extracted_data,
        "validation": validation,
    }
