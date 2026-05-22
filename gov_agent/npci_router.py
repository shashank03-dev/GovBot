"""
NPCI Bank Verification Mock — Showcase Demo

Simulates Sandbox.co Bank Account Verification API:
- Mock penny drop (₹0.01 deposit verification)
- Realistic API response structures
- Simulated processing delays

In production, this would connect to https://api.sandbox.co.in
"""

import logging
import uuid
import asyncio
import hashlib
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from gov_agent.db import supabase

logger = logging.getLogger(__name__)
router = APIRouter()


class BankVerifyRequest(BaseModel):
    phone: str
    account_number: str
    ifsc_code: str
    confirmation_number: str | None = None


class BankVerifyResponse(BaseModel):
    verification_id: str
    status: str  # success, failed, pending
    account_status: str | None
    beneficiary_name: str | None
    message: str


# Mock database of valid bank accounts for demo
MOCK_BANK_ACCOUNTS = {
    "SBIN0012345_325671904812": {
        "name": "SHASHANK GOWDA T",
        "status": "active",
        "branch": "HMT Layout",
    },
    "HDFC0005678_9876543210": {
        "name": "SHASHANK GOWDA T",
        "status": "active",
        "branch": "Bangalore North",
    },
    "ICIC0009012_5555666677": {
        "name": "SHASHANK GOWDA T",
        "status": "active",
        "branch": "Bangalore North",
    },
}


def _hash_account(account_number: str) -> str:
    """Hash account number for storage (PII protection)."""
    return hashlib.sha256(account_number.encode()).hexdigest()


def _get_last4(account_number: str) -> str:
    """Get last 4 digits of account number."""
    return account_number[-4:] if len(account_number) >= 4 else account_number


@router.post("/bank/mock/verify", response_model=BankVerifyResponse)
async def mock_bank_verify(body: BankVerifyRequest):
    """Mock bank account verification with penny drop simulation."""
    
    # Validate IFSC format (11 characters)
    if len(body.ifsc_code) != 11:
        raise HTTPException(status_code=400, detail="Invalid IFSC code format")
    
    # Hash account for storage
    account_hash = _hash_account(body.account_number)
    last4 = _get_last4(body.account_number)
    
    # Check if already verified (idempotency)
    existing = (
        supabase.table("bank_verifications")
        .select("*")
        .eq("account_hash", account_hash)
        .eq("ifsc_code", body.ifsc_code)
        .eq("verified", True)
        .execute()
    )
    
    if existing.data:
        return BankVerifyResponse(
            verification_id=existing.data[0]["id"],
            status="success",
            account_status="verified",
            beneficiary_name=existing.data[0].get("beneficiary_name"),
            message="Account already verified",
        )
    
    # Create verification record
    verification_id = str(uuid.uuid4())
    
    supabase.table("bank_verifications").insert({
        "id": verification_id,
        "phone": body.phone,
        "account_hash": account_hash,
        "account_last4": last4,
        "ifsc_code": body.ifsc_code,
        "status": "pending",
        "verified": False,
        "attempted_at": datetime.now(timezone.utc).isoformat(),
    }).execute()
    
    # Simulate penny drop processing
    await asyncio.sleep(3)  # 3 second delay
    
    # Check mock database
    mock_key = f"{body.ifsc_code}_{body.account_number}"
    mock_account = MOCK_BANK_ACCOUNTS.get(mock_key)
    
    if mock_account:
        # Success case
        supabase.table("bank_verifications").update({
            "status": "verified",
            "verified": True,
            "beneficiary_name": mock_account["name"],
            "account_status": mock_account["status"],
            "mock_response": {
                "penny_drop_amount": 0.01,
                "transaction_id": f"TXN-{uuid.uuid4().hex[:12]}",
                "verified_at": datetime.now(timezone.utc).isoformat(),
                "branch": mock_account["branch"],
            },
            "verified_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", verification_id).execute()
        
        logger.info(f"Bank verification successful for {body.phone}: ****{last4}")
        
        return BankVerifyResponse(
            verification_id=verification_id,
            status="success",
            account_status="verified",
            beneficiary_name=mock_account["name"],
            message=f"Account verified successfully. Name: {mock_account['name']}",
        )
    else:
        # Simulate 80% success rate for random accounts
        import random
        if random.random() < 0.8:
            demo_name = "SHASHANK GOWDA T"
            
            supabase.table("bank_verifications").update({
                "status": "verified",
                "verified": True,
                "beneficiary_name": demo_name,
                "account_status": "active",
                "mock_response": {
                    "penny_drop_amount": 0.01,
                    "transaction_id": f"TXN-{uuid.uuid4().hex[:12]}",
                    "verified_at": datetime.now(timezone.utc).isoformat(),
                    "note": "Demo account verified",
                },
                "verified_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", verification_id).execute()
            
            return BankVerifyResponse(
                verification_id=verification_id,
                status="success",
                account_status="verified",
                beneficiary_name=demo_name,
                message=f"Account verified successfully. Name: {demo_name}",
            )
        else:
            # Failure case
            supabase.table("bank_verifications").update({
                "status": "failed",
                "verified": False,
                "error_message": "Account not found or inactive",
                "mock_response": {
                    "error": "Account verification failed",
                    "reason": "Invalid account number or IFSC code",
                },
            }).eq("id", verification_id).execute()
            
            return BankVerifyResponse(
                verification_id=verification_id,
                status="failed",
                account_status="failed",
                beneficiary_name=None,
                message="Account verification failed. Please check your IFSC code and account number.",
            )


@router.get("/bank/mock/status/{verification_id}")
async def get_bank_verification_status(verification_id: str):
    """Get status of a bank verification."""
    
    result = supabase.table("bank_verifications").select("*").eq("id", verification_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Verification not found")
    
    return result.data[0]


@router.get("/bank/mock/verifications/{phone}")
async def get_phone_verifications(phone: str):
    """Get all bank verifications for a phone number."""
    
    result = (
        supabase.table("bank_verifications")
        .select("*")
        .eq("phone", phone)
        .order("attempted_at", desc=True)
        .execute()
    )
    
    return {
        "phone": phone,
        "verifications": result.data if result.data else [],
        "total": len(result.data) if result.data else 0,
    }


@router.post("/bank/mock/webhook")
async def mock_npci_webhook(payload: dict):
    """Simulate NPCI webhook callback for disbursement status."""
    
    # In production, this would handle real NPCI callbacks
    # For demo, we just log the payload
    logger.info(f"Mock NPCI webhook received: {payload}")
    
    return {"status": "received", "message": "Webhook processed"}


@router.post("/bank/mock/reset/{phone}")
async def reset_mock_bank_data(phone: str):
    """Reset mock bank verification data for a phone (for testing)."""
    
    supabase.table("bank_verifications").delete().eq("phone", phone).execute()
    supabase.table("disbursement_tracking").delete().eq("phone", phone).execute()
    
    return {"message": f"Reset bank verification data for {phone}"}
