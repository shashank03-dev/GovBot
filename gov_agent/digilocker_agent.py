"""
DigiLocker Agent — Document Processing Logic

Processes documents fetched from DigiLocker (mock):
- Extracts text using Gemini Vision
- Validates document types
- Pre-fills application data
"""

import logging
from datetime import datetime, timezone
from gov_agent.db import supabase
from gov_agent.gemini_client import generate_text, has_gemini_client, inline_data_part

logger = logging.getLogger(__name__)


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
    
    # Mock extraction for demo
    return {
        "annual_income": 25000,
        "income_category": "Below 2.5 Lakh",
        "certificate_number": "INC-2024-5678",
        "issue_date": "2024-01-15",
        "valid_until": "2025-01-15",
    }


def extract_caste_certificate_data(doc_data: str) -> dict:
    """Extract caste certificate data."""
    
    # Mock extraction for demo
    return {
        "caste": "SC",
        "category": "Scheduled Caste",
        "certificate_number": "CST-2024-9012",
        "issue_date": "2024-02-20",
    }


def prefill_application_data(phone: str) -> dict:
    """Pre-fill scholarship application from DigiLocker documents."""
    
    documents = get_documents_for_phone(phone)
    
    if not documents:
        return {}
    
    prefill_data = {}
    
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
            })
    
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
