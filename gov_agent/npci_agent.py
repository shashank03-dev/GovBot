"""
NPCI Agent — Bank Verification & Disbursement Logic

Handles bank account verification and scholarship disbursement tracking:
- Manages verification status
- Tracks disbursement status
- WhatsApp notifications for credit alerts
"""

import logging
from datetime import datetime, timezone
from gov_agent.db import supabase
from gov_agent import whatsapp_sender

logger = logging.getLogger(__name__)


def get_latest_verification(phone: str) -> dict | None:
    """Get the latest bank verification for a phone."""
    result = (
        supabase.table("bank_verifications")
        .select("*")
        .eq("phone", phone)
        .eq("verified", True)
        .order("verified_at", desc=True)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def has_verified_bank_account(phone: str) -> bool:
    """Check if phone has a verified bank account."""
    verification = get_latest_verification(phone)
    return verification is not None and verification.get("verified", False)


def _record_activity(phone: str, event: str):
    try:
        supabase.table("activity_feed").insert({
            "phone": phone,
            "event": event,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as exc:
        logger.warning("Failed to record bank activity for %s: %s", phone, exc)


def _demo_amount_for_portal(portal: str | None) -> float:
    return {
        "nsp": 25000.0,
        "ssp": 18000.0,
        "csss": 20000.0,
        "minority": 15000.0,
    }.get((portal or "").lower(), 10000.0)


def get_verified_account_info(phone: str) -> dict | None:
    """Get verified account info for display (masked)."""
    verification = get_latest_verification(phone)
    
    if not verification:
        return None
    
    return {
        "account_last4": verification.get("account_last4", "****"),
        "ifsc_code": verification.get("ifsc_code", ""),
        "beneficiary_name": verification.get("beneficiary_name", "Unknown"),
        "verified_at": verification.get("verified_at"),
    }


def ensure_disbursement_ready(phone: str) -> dict:
    """Create an idempotent pending disbursement record after OTP confirmation."""
    verification = get_latest_verification(phone)
    if not verification:
        return {"ready": False, "message": "No verified bank account found"}

    application_result = (
        supabase.table("applications")
        .select("confirmation_number, portal")
        .eq("phone", phone)
        .order("submitted_at", desc=True)
        .limit(1)
        .execute()
    )
    latest_application = application_result.data[0] if application_result.data else None

    if not latest_application:
        _record_activity(phone, "💳 Bank verified. Ready once an application is submitted.")
        return {
            "ready": True,
            "status": "verified",
            "message": "Bank verified. Ready once an application is submitted.",
        }

    confirmation_number = latest_application.get("confirmation_number")
    existing = (
        supabase.table("disbursement_tracking")
        .select("id, status")
        .eq("confirmation_number", confirmation_number)
        .limit(1)
        .execute()
    )

    if existing.data:
        row = existing.data[0]
        _record_activity(phone, "💳 Bank verified and ready for disbursement review.")
        return {
            "ready": True,
            "status": row.get("status", "pending"),
            "confirmation_number": confirmation_number,
            "disbursement_id": row.get("id"),
            "message": "Bank verified and ready for disbursement review.",
        }

    amount = _demo_amount_for_portal(latest_application.get("portal"))
    inserted = supabase.table("disbursement_tracking").insert({
        "confirmation_number": confirmation_number,
        "phone": phone,
        "amount": amount,
        "bank_verification_id": verification["id"],
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).execute()
    disbursement_id = inserted.data[0]["id"] if inserted.data else None

    _record_activity(phone, "💳 Bank verified and ready for disbursement review.")
    return {
        "ready": True,
        "status": "pending",
        "confirmation_number": confirmation_number,
        "disbursement_id": disbursement_id,
        "message": "Bank verified and ready for disbursement review.",
    }


async def send_verification_request(phone: str, account_number: str, ifsc_code: str) -> dict:
    """Send bank verification request."""
    from gov_agent.npci_router import mock_bank_verify, BankVerifyRequest
    
    try:
        result = await mock_bank_verify(BankVerifyRequest(
            phone=phone,
            account_number=account_number,
            ifsc_code=ifsc_code,
        ))
        
        return {
            "success": result.status == "success",
            "verification_id": result.verification_id,
            "message": result.message,
            "beneficiary_name": result.beneficiary_name,
        }
    except Exception as e:
        logger.error(f"Bank verification error for {phone}: {e}")
        return {
            "success": False,
            "error": str(e),
        }


async def notify_verification_status(phone: str, status: str, beneficiary_name: str | None = None):
    """Send WhatsApp notification for bank verification status."""
    
    if status == "success":
        account_info = get_verified_account_info(phone)
        last4 = account_info.get("account_last4", "****") if account_info else "****"
        name = beneficiary_name or (account_info.get("beneficiary_name") if account_info else "Account Holder")
        
        message = (
            f"✅ *Bank Account Verified*\n\n"
            f"Account: ****{last4}\n"
            f"Name: {name}\n\n"
            f"Your scholarship will be credited to this account within 3-5 working days."
        )
    else:
        message = (
            f"⚠️ *Bank Verification Failed*\n\n"
            f"Please check:\n"
            f"• Account number is correct\n"
            f"• IFSC code is valid\n\n"
            f"Reply VERIFY to try again or contact support."
        )
    
    await whatsapp_sender.send_message(phone, message)


async def track_disbursement(confirmation_number: str, phone: str, amount: float) -> dict:
    """Track scholarship disbursement."""
    
    # Get bank verification
    verification = get_latest_verification(phone)
    
    if not verification:
        return {"error": "No verified bank account found"}
    
    # Create disbursement record
    result = supabase.table("disbursement_tracking").insert({
        "confirmation_number": confirmation_number,
        "phone": phone,
        "amount": amount,
        "bank_verification_id": verification["id"],
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }).execute()
    
    disbursement_id = result.data[0]["id"] if result.data else None
    
    logger.info(f"Disbursement tracking created: {disbursement_id} for {confirmation_number}")
    
    return {
        "disbursement_id": disbursement_id,
        "status": "pending",
        "message": "Disbursement tracking initiated",
    }


async def simulate_disbursement_credit(disbursement_id: str):
    """Simulate scholarship credit (for demo purposes)."""
    
    # Simulate processing delay
    import asyncio
    await asyncio.sleep(2)
    
    # Update to credited
    txn_id = f"NPCI{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    
    supabase.table("disbursement_tracking").update({
        "status": "credited",
        "npci_txn_id": txn_id,
        "credited_at": datetime.now(timezone.utc).isoformat(),
        "notified": False,
    }).eq("id", disbursement_id).execute()
    
    # Get disbursement info
    result = supabase.table("disbursement_tracking").select("phone, amount").eq("id", disbursement_id).execute()
    
    if result.data:
        phone = result.data[0]["phone"]
        amount = result.data[0]["amount"]
        
        # Send WhatsApp notification
        await notify_disbursement_credit(phone, amount, txn_id)


async def notify_disbursement_credit(phone: str, amount: float, txn_id: str):
    """Send WhatsApp notification for scholarship credit."""
    
    account_info = get_verified_account_info(phone)
    last4 = account_info.get("account_last4", "****") if account_info else "****"
    
    message = (
        f"🎉 *Scholarship Credited!*\n\n"
        f"Amount: ₹{amount:,.2f}\n"
        f"Account: ****{last4}\n"
        f"Txn ID: {txn_id}\n\n"
        f"Your scholarship has been successfully credited.\n\n"
        f"Reply BALANCE to check account balance or STATUS for application status."
    )
    
    await whatsapp_sender.send_message(phone, message)
    
    # Mark as notified
    supabase.table("disbursement_tracking").update({
        "notified": True,
    }).eq("phone", phone).eq("npci_txn_id", txn_id).execute()


def format_bank_summary(phone: str) -> str:
    """Format a WhatsApp-friendly summary of bank verification."""
    
    verification = get_latest_verification(phone)
    
    if not verification:
        return "❌ No verified bank account found"
    
    last4 = verification.get("account_last4", "****")
    name = verification.get("beneficiary_name", "Unknown")
    ifsc = verification.get("ifsc_code", "N/A")
    
    return (
        f"💳 *Bank Account Verified*\n\n"
        f"Account: ****{last4}\n"
        f"IFSC: {ifsc}\n"
        f"Name: {name}\n\n"
        f"✅ Ready for scholarship disbursement"
    )


def get_disbursement_status(confirmation_number: str) -> dict | None:
    """Get disbursement status for a confirmation number."""
    
    result = (
        supabase.table("disbursement_tracking")
        .select("*")
        .eq("confirmation_number", confirmation_number)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    
    return result.data[0] if result.data else None
