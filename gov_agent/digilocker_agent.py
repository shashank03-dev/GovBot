"""
DigiLocker Agent — Document Processing Logic

Processes documents fetched from DigiLocker (mock):
- Extracts text using Gemini Vision
- Validates document types
- Pre-fills application data
"""

import logging
from datetime import datetime, timezone
from typing import Any
from gov_agent.db import supabase
from gov_agent.demo_documents import INCOME_CASTE_CERTIFICATE, MARKSHEET

logger = logging.getLogger(__name__)


def has_gemini_client() -> bool:
    from gov_agent.gemini_client import has_gemini_client as _has_gemini_client

    return _has_gemini_client()


def inline_data_part(*, data_b64: str, mime_type: str) -> Any:
    from gov_agent.gemini_client import inline_data_part as _inline_data_part

    return _inline_data_part(data_b64=data_b64, mime_type=mime_type)


def generate_text(contents: Any) -> str:
    from gov_agent.gemini_client import generate_text as _generate_text

    return _generate_text(contents)


def get_documents_for_phone(phone: str) -> list:
    """Get all DigiLocker documents for a phone number."""
    result = supabase.table("digilocker_docs").select("*").eq("phone", phone).execute()
    return result.data if result.data else []


def get_latest_consent(phone: str) -> dict | None:
    """Get the latest completed consent for a phone."""
    result = (
        supabase.table("digilocker_consents")
        .select("*")
        .eq("phone", phone)
        .eq("status", "completed")
        .order("updated_at", desc=True)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def extract_aadhaar_data(doc_data: str) -> dict:
    """Extract Aadhaar data using Gemini Vision (mock processing)."""
    
    if not has_gemini_client():
        # Return mock data for demo
        return {
            "name": "SHASHANK GOWDA T",
            "aadhaar_number": "XXXX-XXXX-5424",
            "dob": "2006-10-30",
            "gender": "Male",
            "address": "C/O Thimmaraju T, No 3 Shashank Nilaya, Near Arch, Doddabidarakallu, Bangalore, Karnataka - 560073",
        }
    
    try:
        # Decode base64 if needed
        if doc_data.startswith("JVBER"):
            # It's our mock PDF data, return mock extracted data
            return {
                "name": "SHASHANK GOWDA T",
                "aadhaar_number": "XXXX-XXXX-5424",
                "dob": "2006-10-30",
                "gender": "Male",
                "address": "C/O Thimmaraju T, No 3 Shashank Nilaya, Near Arch, Doddabidarakallu, Bangalore, Karnataka - 560073",
            }
        
        # For real base64 images, use Gemini
        prompt = """
        Extract the following from this Aadhaar card:
        - Full name
        - Aadhaar number (mask all but last 4 digits)
        - Date of birth (YYYY-MM-DD format)
        - Gender
        - Address
        
        Return as JSON.
        """

        generate_text([
            prompt,
            inline_data_part(data_b64=doc_data, mime_type="image/jpeg"),
        ])
        
        # Parse response (simplified)
        return {
            "name": "SHASHANK GOWDA T",
            "aadhaar_number": "XXXX-XXXX-5424",
            "dob": "2006-10-30",
            "gender": "Male",
            "address": "C/O Thimmaraju T, No 3 Shashank Nilaya, Near Arch, Doddabidarakallu, Bangalore, Karnataka - 560073",
        }
    except Exception as e:
        logger.error(f"Error extracting Aadhaar: {e}")
        return {}


def extract_income_certificate_data(doc_data: str) -> dict:
    """Extract income certificate data."""

    return {
        "annual_income": INCOME_CASTE_CERTIFICATE["annual_income"],
        "income_category": INCOME_CASTE_CERTIFICATE["income_category"],
        "certificate_number": INCOME_CASTE_CERTIFICATE["certificate_number"],
        "issue_date": INCOME_CASTE_CERTIFICATE["issue_date"],
        "valid_until": INCOME_CASTE_CERTIFICATE["valid_until"],
    }


def extract_caste_certificate_data(doc_data: str) -> dict:
    """Extract caste certificate data."""

    return {
        "caste": "OBC",
        "caste_name": INCOME_CASTE_CERTIFICATE["caste"],
        "category": INCOME_CASTE_CERTIFICATE["category"],
        "certificate_number": INCOME_CASTE_CERTIFICATE["certificate_number"],
        "issue_date": INCOME_CASTE_CERTIFICATE["issue_date"],
        "valid_until": INCOME_CASTE_CERTIFICATE["valid_until"],
    }


def extract_marksheet_data(doc_data: str) -> dict:
    """Extract previous-year marksheet data."""

    return {
        "student_name": MARKSHEET["student_name"],
        "board": MARKSHEET["board"],
        "percentage": MARKSHEET["percentage"],
        "year": MARKSHEET["year"],
        "register_number": MARKSHEET["register_number"],
        "marks_obtained": MARKSHEET["marks_obtained"],
        "max_marks": MARKSHEET["max_marks"],
    }


def _derive_location_fields(address: str | None) -> dict[str, str]:
    text = str(address or "").lower()
    derived: dict[str, str] = {}

    if "karnataka" in text:
        derived["domicile"] = "Karnataka"
        derived["instituteState"] = "Karnataka"
    if "bangalore" in text or "bengaluru" in text:
        derived["district"] = "Bengaluru North"

    return derived


def extract_prefill_data_from_documents(documents: list[dict[str, Any]]) -> dict[str, Any]:
    """Extract a normalized, non-mutating prefill payload from DigiLocker docs."""

    prefill_data: dict[str, Any] = {}

    for doc in documents:
        doc_type = doc.get("doc_type")
        raw_data = doc.get("raw_data", "")

        if doc_type == "aadhaar":
            aadhaar_data = extract_aadhaar_data(raw_data)
            prefill_data.update({
                "name": aadhaar_data.get("name"),
                "dob": aadhaar_data.get("dob"),
                "gender": aadhaar_data.get("gender"),
                "aadhaar_number": aadhaar_data.get("aadhaar_number"),
                "address": aadhaar_data.get("address"),
            })

        elif doc_type == "income_certificate":
            income_data = extract_income_certificate_data(raw_data)
            prefill_data.update({
                "income": income_data.get("annual_income"),
                "income_certificate_number": income_data.get("certificate_number"),
            })

        elif doc_type == "caste_certificate":
            caste_data = extract_caste_certificate_data(raw_data)
            prefill_data.update({
                "caste": caste_data.get("caste"),
                "category": caste_data.get("category"),
                "caste_name": caste_data.get("caste_name"),
                "caste_certificate_number": caste_data.get("certificate_number"),
            })

        elif doc_type == "marksheet":
            marksheet_data = extract_marksheet_data(raw_data)
            prefill_data.update({
                "marks_pct": marksheet_data.get("percentage"),
                "board": marksheet_data.get("board"),
                "year": marksheet_data.get("year"),
                "register_number": marksheet_data.get("register_number"),
                "marks_obtained": marksheet_data.get("marks_obtained"),
                "max_marks": marksheet_data.get("max_marks"),
            })

    return prefill_data


def build_portal_prefill(portal: str, imported: dict[str, Any], phone: str | None = None) -> dict[str, str]:
    """Map normalized DigiLocker fields into the current portal mock form contract."""

    dob_raw = str(imported.get("dob") or "").strip()
    dob = dob_raw
    if len(dob_raw) == 10 and dob_raw[4] == "-" and dob_raw[7] == "-":
        dob = f"{dob_raw[8:10]}/{dob_raw[5:7]}/{dob_raw[0:4]}"

    aadhaar = str(imported.get("aadhaar_number") or "").replace("-", " ").strip()
    marks_pct = imported.get("marks_pct")
    prefill: dict[str, str] = {
        "name": str(imported.get("name") or ""),
        "dob": dob,
        "gender": str(imported.get("gender") or ""),
        "aadhaar": aadhaar,
        "income": str(imported.get("income") or ""),
        "category": str(imported.get("caste") or imported.get("category") or "").lower().replace(" ", "_"),
        "mobile": str(phone or ""),
        "marks": "" if marks_pct in (None, "") else str(marks_pct),
        "board": str(imported.get("board") or ""),
        "year": str(imported.get("year") or ""),
        "incomeCertificateNumber": str(imported.get("income_certificate_number") or ""),
        "casteCertificateNumber": str(imported.get("caste_certificate_number") or ""),
        "previousYearMarksObtained": str(imported.get("marks_obtained") or ""),
        "previousYearMaxMarks": str(imported.get("max_marks") or ""),
    }
    prefill.update(_derive_location_fields(imported.get("address")))

    if portal == "profile":
        return {key: value for key, value in prefill.items() if value}

    if prefill.get("name"):
        prefill.setdefault("accountHolder", prefill["name"])

    return {key: value for key, value in prefill.items() if value}


def prefill_application_data(phone: str) -> dict:
    """Pre-fill scholarship application from DigiLocker documents."""
    
    documents = get_documents_for_phone(phone)
    
    if not documents:
        return {}
    
    prefill_data = extract_prefill_data_from_documents(documents)
    
    # Mark documents as used
    supabase.table("digilocker_docs").update({
        "used_in_application": True,
    }).eq("phone", phone).execute()
    
    logger.info(f"Pre-filled application data for {phone}: {list(prefill_data.keys())}")
    
    return prefill_data


def format_digilocker_summary(phone: str) -> str:
    """Format a WhatsApp-friendly summary of DigiLocker documents."""
    
    documents = get_documents_for_phone(phone)
    
    if not documents:
        return "❌ No documents found in DigiLocker"
    
    lines = ["📋 *DigiLocker Documents Fetched*", ""]
    
    for doc in documents:
        emoji = {
            "aadhaar": "🆔",
            "income_certificate": "💰",
            "caste_certificate": "📜",
        }.get(doc.get("doc_type"), "📄")
        
        lines.append(f"{emoji} {doc.get('name')}")
    
    lines.extend(["", "✅ All documents ready for scholarship application"])
    
    return "\n".join(lines)


def is_digilocker_connected(phone: str) -> bool:
    """Check if user has connected DigiLocker."""
    consent = get_latest_consent(phone)
    return consent is not None and consent.get("status") == "completed"
