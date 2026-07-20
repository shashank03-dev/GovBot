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
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from gov_agent import config
from gov_agent.db import supabase
from gov_agent.user_auth import optional_jwt as _optional_jwt, require_phone_access

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
    bank_name: str | None = None
    branch: str | None = None
    transaction_id: str | None = None
    message: str


# Mock database of valid bank accounts for demo — synthetic data only.
# The SBIN0012345_000011112222 entry is the canonical showcase account and must
# match NSP_DEMO_DATA in frontend/lib/nspDemoAutofill.mjs.
MOCK_BANK_ACCOUNTS = {
    "SBIN0012345_000011112222": {
        "name": "DEMO CITIZEN KUMAR",
        "status": "active",
        "branch": "Demo Branch",
        "bank_name": "State Bank of India",
    },
    "HDFC0005678_9876543210": {
        "name": "DEMO CITIZEN KUMAR",
        "status": "active",
        "branch": "Bangalore North",
        "bank_name": "HDFC Bank",
    },
    "ICIC0009012_5555666677": {
        "name": "DEMO CITIZEN KUMAR",
        "status": "active",
        "branch": "Bangalore North",
        "bank_name": "ICICI Bank",
    },
}


class BankReadyRequest(BaseModel):
    phone: str


def _infer_bank_name(ifsc_code: str) -> str:
    if ifsc_code.startswith("SBIN"):
        return "State Bank of India"
    if ifsc_code.startswith("HDFC"):
        return "HDFC Bank"
    if ifsc_code.startswith("ICIC"):
        return "ICICI Bank"
    return "Demo Bank"


def _hash_account(account_number: str) -> str:
    """Hash account number for storage (PII protection)."""
    return hashlib.sha256(account_number.encode()).hexdigest()


def _get_last4(account_number: str) -> str:
    """Get last 4 digits of account number."""
    return account_number[-4:] if len(account_number) >= 4 else account_number


async def _sleep_for_mock_delay(seconds: float) -> None:
    if seconds > 0:
        await asyncio.sleep(seconds)


def _sync_verified_bank_to_profile(
    phone: str,
    ifsc_code: str,
    account_number: str,
    bank_name: str | None,
    branch: str | None,
) -> None:
    """Copy the verified bank details into the citizen's profile so the form
    fields fill automatically. Verified data is authoritative, so it overwrites
    whatever the citizen may have typed. Best-effort: never fails verification."""
    updates: dict = {
        "phone": phone,
        "bank_ifsc": ifsc_code,
        "bank_account": account_number,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if bank_name:
        updates["bank_name"] = bank_name
    if branch:
        updates["bank_branch"] = branch
    try:
        supabase.table("citizen_profiles").upsert(updates, on_conflict="phone").execute()
    except Exception as exc:  # pragma: no cover - profile sync is best-effort
        logger.warning("bank verify -> profile sync failed for %s: %s", phone, exc)


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
        existing_row = existing.data[0]
        existing_meta = existing_row.get("mock_response") or {}
        _sync_verified_bank_to_profile(
            body.phone,
            body.ifsc_code,
            body.account_number,
            existing_meta.get("bank_name") or _infer_bank_name(existing_row.get("ifsc_code", "")),
            existing_meta.get("branch"),
        )
        return BankVerifyResponse(
            verification_id=existing_row["id"],
            status="success",
            account_status="verified",
            beneficiary_name=existing_row.get("beneficiary_name"),
            bank_name=existing_meta.get("bank_name") or _infer_bank_name(existing_row.get("ifsc_code", "")),
            branch=existing_meta.get("branch"),
            transaction_id=existing_meta.get("transaction_id"),
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
    
    await _sleep_for_mock_delay(config.MOCK_NPCI_DELAY_SECONDS)
    
    # Check mock database
    mock_key = f"{body.ifsc_code}_{body.account_number}"
    mock_account = MOCK_BANK_ACCOUNTS.get(mock_key)
    
    if mock_account:
        # Success case
        transaction_id = f"TXN-{uuid.uuid4().hex[:12]}"
        supabase.table("bank_verifications").update({
            "status": "verified",
            "verified": True,
            "beneficiary_name": mock_account["name"],
            "account_status": mock_account["status"],
            "mock_response": {
                "penny_drop_amount": 0.01,
                "transaction_id": transaction_id,
                "verified_at": datetime.now(timezone.utc).isoformat(),
                "branch": mock_account["branch"],
                "bank_name": mock_account["bank_name"],
            },
            "verified_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", verification_id).execute()
        
        logger.info(f"Bank verification successful for {body.phone}: ****{last4}")

        _sync_verified_bank_to_profile(
            body.phone,
            body.ifsc_code,
            body.account_number,
            mock_account["bank_name"],
            mock_account["branch"],
        )

        return BankVerifyResponse(
            verification_id=verification_id,
            status="success",
            account_status="verified",
            beneficiary_name=mock_account["name"],
            bank_name=mock_account["bank_name"],
            branch=mock_account["branch"],
            transaction_id=transaction_id,
            message=f"Account verified successfully. Name: {mock_account['name']}",
        )
    else:
        supabase.table("bank_verifications").update({
            "status": "failed",
            "verified": False,
            "error_message": "Account number does not match bank records",
            "mock_response": {
                "error": "Account verification failed",
                "reason": "Account number does not match bank records",
                "bank_name": _infer_bank_name(body.ifsc_code),
            },
        }).eq("id", verification_id).execute()

        return BankVerifyResponse(
            verification_id=verification_id,
            status="failed",
            account_status="failed",
            beneficiary_name=None,
            bank_name=_infer_bank_name(body.ifsc_code),
            branch=None,
            transaction_id=None,
            message="Account number does not match bank records. Enter the correct number to continue.",
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


@router.post("/bank/mock/ready")
async def mark_bank_ready(
    body: BankReadyRequest,
    token_phone: str | None = Depends(_optional_jwt),
):
    """Mark a verified bank as payout-ready after OTP confirmation."""
    from gov_agent.npci_agent import ensure_disbursement_ready

    phone = require_phone_access(body.phone, token_phone)
    return ensure_disbursement_ready(phone)


@router.post("/bank/mock/reset/{phone}")
async def reset_mock_bank_data(phone: str):
    """Reset mock bank verification data for a phone (for testing)."""
    
    supabase.table("bank_verifications").delete().eq("phone", phone).execute()
    supabase.table("disbursement_tracking").delete().eq("phone", phone).execute()
    
    return {"message": f"Reset bank verification data for {phone}"}
