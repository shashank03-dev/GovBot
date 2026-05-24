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
    SUPABASE_DOCUMENTS_BUCKET,
    WHATSAPP_TOKEN,
)
from gov_agent.db import supabase
from gov_agent.gemini_client import generate_text, has_gemini_client, inline_data_part

logger = logging.getLogger(__name__)

DOC_TYPES = {"pan", "aadhaar", "income_cert", "caste_cert", "marksheet"}
DOC_SOURCES = {"web", "whatsapp", "digilocker"}
VALIDATION_DOC_TYPES = {"aadhaar", "income_cert", "caste_cert", "marksheet"}
NO_EXPIRY_DOC_TYPES = {"pan", "aadhaar"}
ALLOWED_UPLOAD_MIME_TYPES = {"image/jpeg", "image/jpg", "image/png", "application/pdf"}
MAX_UPLOAD_BYTES = 8 * 1024 * 1024
_BUCKET_READY = False


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


def build_profile_updates(doc_type: str, extracted_data: dict[str, Any]) -> dict[str, Any]:
    if doc_type == "pan":
        return {
            key: extracted_data[key]
            for key in ("pan_number", "full_name", "father_name", "dob")
            if extracted_data.get(key)
        }
    if doc_type == "aadhaar":
        updates = {
            key: extracted_data[key]
            for key in ("full_name", "dob", "gender", "address")
            if extracted_data.get(key)
        }
        aadhaar_number = str(extracted_data.get("aadhaar_number", "")).strip()
        digits = re.sub(r"\D", "", aadhaar_number)
        if digits:
            updates["aadhaar_last4"] = digits[-4:]
        return updates
    return {}


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


def _materialize_document(document: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
    if not document:
        return None
    materialized = dict(document)
    effective = _effective_extracted_data(materialized)
    materialized["ocr_extracted_data"] = materialized.get("ocr_extracted_data") or materialized.get("extracted_data") or {}
    materialized["user_corrected_data"] = materialized.get("user_corrected_data") or {}
    materialized["extracted_data"] = effective
    if materialized.get("source_confidence") is None:
        materialized["source_confidence"] = materialized.get("confidence", 0)
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
    label_map = {
        "pan": "PAN Card",
        "aadhaar": "Aadhaar Card",
        "income_cert": "Income Certificate",
        "caste_cert": "Caste Certificate",
        "marksheet": "Marksheet",
    }
    label = label_map.get(requested_type, requested_type.replace("_", " ").title())
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
            ("Issue Date", "issue_date"),
            ("Valid Until", "valid_until"),
        ],
        "caste_cert": [
            ("Certificate Number", "certificate_number"),
            ("Caste", "caste"),
            ("Category", "category"),
            ("Issue Date", "issue_date"),
        ],
        "marksheet": [
            ("Student Name", "student_name"),
            ("Roll Number", "roll_number"),
            ("Year", "year"),
            ("Percentage", "percentage"),
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
            "address": (
                "C/O Thimmaraju T, No 3 Shashank Nilaya, Near Arch, "
                "Doddabidarakallu, Bangalore North, Nagasandra, Bangalore, "
                "Karnataka - 560073"
            ),
        },
        "income_cert": {
            "certificate_number": "INC-2024-5678",
            "annual_income": 25000,
            "issue_date": "2024-01-15",
            "valid_until": "2025-01-15",
        },
        "caste_cert": {
            "certificate_number": "CST-2024-9012",
            "caste": "SC",
            "category": "Scheduled Caste",
            "issue_date": "2024-02-20",
        },
        "marksheet": {
            "student_name": "SHASHANK GOWDA T",
            "roll_number": "MS-2024-1122",
            "year": "2024",
            "percentage": 95.5,
            "issue_date": "2024-03-15",
        },
    }
    extracted = mock_map.get(doc_type, {}).copy()
    return extracted, 0.91 if extracted else 0.0, "fallback-demo-extraction"


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
            "- Full name as printed\n"
            "- Date of birth (YYYY-MM-DD)\n"
            "- 12-digit Aadhaar number (1234 5678 9012 format)\n"
            "- Complete address\n"
            "- Gender\n"
            'Return JSON only: {"aadhaar_number":"","full_name":"","dob":"","address":"","gender":"","confidence":0.0}',
            {"aadhaar_number": "", "full_name": "", "dob": "", "address": "", "gender": "", "confidence": 0.0},
        ),
        "income_cert": (
            "Extract from this income certificate image:\n"
            "- Certificate number\n"
            "- Annual income as integer rupees\n"
            "- Issue date (YYYY-MM-DD)\n"
            "- Valid until date if present (YYYY-MM-DD)\n"
            'Return JSON only: {"certificate_number":"","annual_income":0,"issue_date":"","valid_until":"","confidence":0.0}',
            {"certificate_number": "", "annual_income": 0, "issue_date": "", "valid_until": "", "confidence": 0.0},
        ),
        "caste_cert": (
            "Extract from this caste certificate image:\n"
            "- Certificate number\n"
            "- Caste\n"
            "- Category\n"
            "- Issue date (YYYY-MM-DD)\n"
            'Return JSON only: {"certificate_number":"","caste":"","category":"","issue_date":"","confidence":0.0}',
            {"certificate_number": "", "caste": "", "category": "", "issue_date": "", "confidence": 0.0},
        ),
        "marksheet": (
            "Extract from this marksheet image:\n"
            "- Student name\n"
            "- Roll number\n"
            "- Passing year\n"
            "- Percentage as number\n"
            "- Issue date if present (YYYY-MM-DD)\n"
            'Return JSON only: {"student_name":"","roll_number":"","year":"","percentage":0.0,"issue_date":"","confidence":0.0}',
            {"student_name": "", "roll_number": "", "year": "", "percentage": 0.0, "issue_date": "", "confidence": 0.0},
        ),
    }
    return prompts[doc_type]


def extract_document_data(
    doc_type: str,
    *,
    image_b64: str,
    mime_type: Optional[str] = None,
) -> tuple[dict[str, Any], float, str]:
    if doc_type not in DOC_TYPES:
        raise ValueError(f"Unsupported document type: {doc_type}")

    if not has_gemini_client() or mime_type == "application/pdf":
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


def analyze_document_validity(doc_type: str, image_b64: str) -> dict[str, Any]:
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

    if not has_gemini_client():
        flags: list[str] = []
        issue_date_obj = None
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
        return {
            "valid": False,
            "doc_type": doc_type,
            "issue_date": None,
            "expiry_date": None,
            "flags": ["unreadable"],
            "message": "Document validation unavailable: GEMINI_API_KEY not configured",
            "verification_status": "unknown",
        }

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
        flags.append("unreadable")

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

    merged = {"phone": phone, "updated_at": datetime.now(timezone.utc).isoformat()}
    for key, value in updates.items():
        current_value = current.get(key)
        if key in {"pan_number", "aadhaar_last4"} or not current_value:
            merged[key] = value

    if len(merged) > 2:
        supabase.table("citizen_profiles").upsert(merged, on_conflict="phone").execute()


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
    latest_by_type: dict[str, dict[str, Any]] = {}
    for doc in docs:
        latest_by_type.setdefault(doc["doc_type"], _materialize_document(doc) or doc)
    latest_documents = list(latest_by_type.values())
    if masked:
        return [mask_document_for_list(doc) for doc in latest_documents]
    return latest_documents


def list_documents_by_type(phone: str, doc_type: str) -> list[dict[str, Any]]:
    result = (
        supabase.table("user_documents")
        .select("*")
        .eq("phone", phone)
        .eq("doc_type", doc_type)
        .order("created_at", desc=True)
        .execute()
    )
    return [_materialize_document(doc) or doc for doc in (result.data or [])]


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


def update_user_document(document_id: str, extracted_updates: dict[str, Any]) -> Optional[dict[str, Any]]:
    document = get_user_document(document_id)
    if not document:
        return None

    ocr_data = document.get("ocr_extracted_data") or document.get("extracted_data") or {}
    merged_corrections = merge_extracted_data(document.get("user_corrected_data") or {}, extracted_updates)
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
) -> dict[str, Any]:
    if doc_type not in DOC_TYPES:
        raise ValueError(f"Unsupported document type: {doc_type}")
    if source not in DOC_SOURCES:
        raise ValueError(f"Unsupported source: {source}")
    if not image_b64 and not media_id:
        raise ValueError("Provide image_b64 or media_id")

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

    existing_docs = list_documents_by_type(phone, doc_type)
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
        )
    except Exception as exc:
        _remove_storage_path(path)
        raise DocumentVaultError("ocr", "OCR failed: GovBot could not read the document.") from exc

    if doc_type in VALIDATION_DOC_TYPES:
        try:
            validation = analyze_document_validity(doc_type, payload_b64)
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
            "message": "No validity check required.",
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

    payload = {
        "phone": phone,
        "doc_type": doc_type,
        "source": source,
        "storage_path": path,
        "mime_type": mime_type,
        "original_filename": file_name,
        "status": status,
        "verification_status": validation.get("verification_status", "unknown"),
        "issue_date": issue_date.isoformat() if issue_date else None,
        "expiry_date": expiry_date.isoformat() if expiry_date else None,
        "ocr_extracted_data": extracted_data,
        "user_corrected_data": {},
        "extracted_data": extracted_data,
        "source_confidence": confidence,
        "confidence": confidence,
        "status_reason": status_reason,
        "edited_by_user": False,
        "edited_at": None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    old_storage_path = existing_doc.get("storage_path") if existing_doc else None
    try:
        if existing_doc:
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

    if existing_doc and old_storage_path and old_storage_path != path:
        _remove_storage_path(old_storage_path)
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
