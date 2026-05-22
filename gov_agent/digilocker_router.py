"""
DigiLocker Mock Integration — Showcase Demo

Simulates Setu DigiLocker API for demo purposes:
- Mock OAuth consent flow
- Simulated document fetch
- Realistic API response structures

In production, this would connect to https://dg.setu.co/api/v1
"""

import logging
import uuid
import asyncio
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from gov_agent.db import supabase
from gov_agent.config import BASE_URL
from gov_agent.document_vault import ingest_document

logger = logging.getLogger(__name__)
router = APIRouter()


class CreateConsentRequest(BaseModel):
    phone: str
    redirect_url: str | None = None


class ConsentResponse(BaseModel):
    consent_id: str
    redirect_url: str
    status: str
    expires_at: str


class DocumentData(BaseModel):
    doctype: str
    name: str
    uri: str
    size: int
    mime_type: str


MOCK_DOCUMENTS = [
    {
        "doctype": "aadhaar",
        "name": "Aadhaar Card",
        "uri": "digilocker://mock/aadhaar/1234",
        "size": 24580,
        "mime_type": "application/pdf",
        "data": "JVBERi0xLjQKJeLjz9MKMyAwIG9iago8PAovVHlwZSAvUGFnZQo+PgplbmRvYmoK",  # Mock PDF
    },
    {
        "doctype": "income_certificate",
        "name": "Income Certificate",
        "uri": "digilocker://mock/income/5678",
        "size": 18432,
        "mime_type": "application/pdf",
        "data": "JVBERi0xLjQKJeLjz9MKMyAwIG9iago8PAovVHlwZSAvUGFnZQo+PgplbmRvYmoK",
    },
    {
        "doctype": "caste_certificate",
        "name": "Caste Certificate",
        "uri": "digilocker://mock/caste/9012",
        "size": 16384,
        "mime_type": "application/pdf",
        "data": "JVBERi0xLjQKJeLjz9MKMyAwIG9iago8PAovVHlwZSAvUGFnZQo+PgplbmRvYmoK",
    },
]

_VAULT_TYPE_MAP = {
    "aadhaar": "aadhaar",
    "income_certificate": "income_cert",
    "caste_certificate": "caste_cert",
    "marksheet": "marksheet",
}


@router.post("/digilocker/mock/consent", response_model=ConsentResponse)
async def create_mock_consent(body: CreateConsentRequest):
    """Create a mock DigiLocker consent request."""
    
    consent_id = f"mock-consent-{uuid.uuid4().hex[:12]}"
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
    
    # Store consent in database
    supabase.table("digilocker_consents").insert({
        "consent_id": consent_id,
        "phone": body.phone,
        "status": "pending",
        "scope": ["aadhaar", "income_certificate", "caste_certificate"],
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }).execute()
    
    # Create callback URL with consent ID
    callback_url = f"{BASE_URL}/digilocker/callback?consent_id={consent_id}"
    
    logger.info(f"Mock consent created for {body.phone}: {consent_id}")
    
    return ConsentResponse(
        consent_id=consent_id,
        redirect_url=callback_url,
        status="pending",
        expires_at=expires_at.isoformat(),
    )


@router.get("/digilocker/mock/callback")
async def mock_callback(consent_id: str, action: str = "approve"):
    """Simulate user authorization callback."""
    
    # Simulate processing delay
    await asyncio.sleep(2)
    
    if action == "reject":
        supabase.table("digilocker_consents").update({
            "status": "rejected",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("consent_id", consent_id).execute()
        return {"status": "rejected", "message": "User denied access"}
    
    # Get consent record
    result = supabase.table("digilocker_consents").select("phone").eq("consent_id", consent_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Consent not found")
    
    phone = result.data[0]["phone"]
    
    # Simulate fetching documents
    await asyncio.sleep(1)
    
    # Store mock documents
    for doc in MOCK_DOCUMENTS:
        supabase.table("digilocker_docs").insert({
            "consent_id": consent_id,
            "phone": phone,
            "doc_type": doc["doctype"],
            "name": doc["name"],
            "digilocker_uri": doc["uri"],
            "size": doc["size"],
            "mime_type": doc["mime_type"],
            "raw_data": doc["data"],
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
        vault_type = _VAULT_TYPE_MAP.get(doc["doctype"])
        if vault_type:
            try:
                await ingest_document(
                    phone=phone,
                    doc_type=vault_type,
                    source="digilocker",
                    image_b64=doc["data"],
                    file_name=doc["name"].lower().replace(" ", "-") + ".pdf",
                    mime_type=doc["mime_type"],
                )
            except Exception as exc:
                logger.warning("DigiLocker vault sync failed for %s/%s: %s", phone, doc["doctype"], exc)
    
    # Update consent status
    supabase.table("digilocker_consents").update({
        "status": "completed",
        "documents_fetched": len(MOCK_DOCUMENTS),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("consent_id", consent_id).execute()
    
    logger.info(f"Mock consent completed for {phone}: {consent_id}")
    
    return {
        "status": "success",
        "consent_id": consent_id,
        "documents_fetched": len(MOCK_DOCUMENTS),
        "message": "DigiLocker connected successfully",
    }


@router.get("/digilocker/mock/documents/{consent_id}")
async def get_mock_documents(consent_id: str):
    """Get documents for a completed consent."""
    
    result = supabase.table("digilocker_docs").select("*").eq("consent_id", consent_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="No documents found")
    
    return {
        "consent_id": consent_id,
        "documents": result.data,
        "total": len(result.data),
    }


@router.get("/digilocker/mock/status/{consent_id}")
async def get_mock_status(consent_id: str):
    """Get consent status."""
    
    result = supabase.table("digilocker_consents").select("*").eq("consent_id", consent_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Consent not found")
    
    return result.data[0]


@router.post("/digilocker/mock/reset/{phone}")
async def reset_mock_digilocker(phone: str):
    """Reset mock DigiLocker data for a phone (for testing)."""
    
    # Delete consents
    supabase.table("digilocker_consents").delete().eq("phone", phone).execute()
    
    # Delete documents
    supabase.table("digilocker_docs").delete().eq("phone", phone).execute()
    
    return {"message": f"Reset DigiLocker data for {phone}"}
