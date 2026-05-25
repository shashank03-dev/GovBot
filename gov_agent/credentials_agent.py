"""
Credentials Agent — Blockchain Credential Management

Handles credential lifecycle:
- Auto-issue on application approval
- Send WhatsApp notifications with credential links
- Generate QR codes for physical verification
"""

import logging
import asyncio
from datetime import datetime, timezone
from gov_agent.db import supabase
from gov_agent import whatsapp_sender
from gov_agent.config import BASE_URL

logger = logging.getLogger(__name__)


async def issue_credential_on_approval(confirmation_number: str, phone: str) -> dict:
    """Automatically issue credential when scholarship is approved."""
    
    # Get application details
    result = supabase.table("applications").select("*").eq("confirmation_number", confirmation_number).execute()
    
    if not result.data:
        logger.error(f"Application not found: {confirmation_number}")
        return {"error": "Application not found"}
    
    app = result.data[0]
    
    # Get session data for student name
    session_result = supabase.table("sessions").select("collected_data").eq("phone", phone).execute()
    session_data = session_result.data[0]["collected_data"] if session_result.data else {}
    
    student_name = session_data.get("name", "Student")
    scholarship_type = app.get("portal", "NSP").upper()
    
    # Default amount based on portal (for demo)
    amounts = {
        "nsp": 25000,
        "ssp": 15000,
        "csss": 20000,
        "minority": 12000,
    }
    amount = amounts.get(app.get("portal", "nsp"), 10000)
    
    # Issue credential
    from gov_agent.credentials_router import issue_blockchain_credential, IssueCredentialRequest
    
    try:
        credential = await issue_blockchain_credential(IssueCredentialRequest(
            confirmation_number=confirmation_number,
            phone=phone,
            student_name=student_name,
            scholarship_type=scholarship_type,
            amount=amount,
        ))
        
        # Send WhatsApp notification
        await notify_credential_issued(
            phone,
            credential.credential_id,
            credential.confirmation_number,
            credential.polygonscan_url,
            credential.qr_code_url
        )
        
        return {
            "success": True,
            "credential_id": credential.credential_id,
            "tx_hash": credential.blockchain_tx_hash,
        }
    except Exception as e:
        logger.error(f"Failed to issue credential: {e}")
        return {"error": str(e)}


async def notify_credential_issued(
    phone: str,
    credential_id: str,
    confirmation_number: str,
    polygonscan_url: str,
    verify_url: str
):
    """Send WhatsApp notification for issued credential."""
    
    message = (
        f"🎓 *Scholarship Credential Issued!*\n\n"
        f"Confirmation: {confirmation_number}\n"
        f"Credential ID: {credential_id[:20]}...\n\n"
        f"🔗 *Blockchain Record:*\n{polygonscan_url}\n\n"
        f"📱 *Verification Portal:*\n{verify_url}\n\n"
        f"Share this QR code or link with employers, colleges, or any verifier. "
        f"They can instantly verify your scholarship on the blockchain.\n\n"
        f"View all your credentials: {BASE_URL}/wallet"
    )
    
    await whatsapp_sender.send_message(phone, message)


def get_credential_summary(credential_id: str) -> dict | None:
    """Get credential summary for display."""
    
    result = supabase.table("verifiable_credentials").select("*").eq("credential_id", credential_id).execute()
    
    if not result.data:
        return None
    
    cred = result.data[0]
    cred_json = cred.get("credential_json", {})
    subject = cred_json.get("credentialSubject", {})
    
    return {
        "credential_id": cred["credential_id"],
        "confirmation_number": cred["confirmation_number"],
        "student_name": subject.get("name", "Unknown"),
        "scholarship_type": subject.get("scholarshipType", "Unknown"),
        "amount": subject.get("amount", 0),
        "issued_at": cred["issued_at"],
        "blockchain_tx_hash": cred["blockchain_tx_hash"],
        "ipfs_hash": cred.get("ipfs_hash"),
        "revoked": cred.get("revoked", False),
        "polygonscan_url": f"https://mumbai.polygonscan.com/tx/{cred['blockchain_tx_hash']}",
        "verify_url": f"{BASE_URL}/verify/{cred['credential_id']}",
    }


def format_credential_whatsapp(credential_id: str) -> str:
    """Format credential for WhatsApp display."""
    
    summary = get_credential_summary(credential_id)
    
    if not summary:
        return "❌ Credential not found"
    
    return (
        f"🎓 *GovBot Scholarship Credential*\n\n"
        f"*Student:* {summary['student_name']}\n"
        f"*Scholarship:* {summary['scholarship_type']}\n"
        f"*Amount:* ₹{summary['amount']:,.2f}\n"
        f"*Confirmation:* {summary['confirmation_number']}\n\n"
        f"*Blockchain:* ✅ Verified on Polygon\n"
        f"*Issued:* {summary['issued_at'][:10]}\n\n"
        f"🔗 {summary['verify_url']}"
    )


async def revoke_credential(credential_id: str, reason: str = "Administrative revocation") -> bool:
    """Revoke a credential (if needed)."""
    
    try:
        # Update database
        supabase.table("verifiable_credentials").update({
            "revoked": True,
            "revoked_at": datetime.now(timezone.utc).isoformat(),
            "revoke_reason": reason,
        }).eq("credential_id", credential_id).execute()
        
        # Try to revoke on blockchain
        try:
            from web3 import Web3
            from gov_agent.config import POLYGON_RPC_URL, POLYGON_PRIVATE_KEY, CONTRACT_ADDRESS
            from gov_agent.credentials_router import CONTRACT_ABI
            
            if all([POLYGON_RPC_URL, POLYGON_PRIVATE_KEY, CONTRACT_ADDRESS]):
                w3 = Web3(Web3.HTTPProvider(POLYGON_RPC_URL))
                contract = w3.eth.contract(address=CONTRACT_ADDRESS, abi=CONTRACT_ABI)
                
                account = w3.eth.account.from_key(POLYGON_PRIVATE_KEY)
                
                tx = contract.functions.revokeCredential(credential_id, reason).build_transaction({
                    'from': account.address,
                    'nonce': w3.eth.get_transaction_count(account.address),
                    'gas': 100000,
                    'gasPrice': w3.to_wei('2', 'gwei'),
                })
                
                signed_tx = w3.eth.account.sign_transaction(tx, POLYGON_PRIVATE_KEY)
                w3.eth.send_raw_transaction(signed_tx.rawTransaction)
        except Exception as e:
            logger.warning(f"Could not revoke on blockchain: {e}")
        
        return True
    except Exception as e:
        logger.error(f"Failed to revoke credential: {e}")
        return False


def get_wallet_summary(phone: str) -> dict:
    """Get credential wallet summary for a user."""
    
    result = (
        supabase.table("verifiable_credentials")
        .select("*")
        .eq("phone", phone)
        .order("issued_at", desc=True)
        .execute()
    )
    
    if not result.data:
        return {
            "phone": phone,
            "total_credentials": 0,
            "credentials": [],
            "total_amount": 0,
        }
    
    credentials = []
    total_amount = 0
    
    for cred in result.data:
        cred_json = cred.get("credential_json", {})
        subject = cred_json.get("credentialSubject", {})
        amount = subject.get("amount", 0)
        total_amount += amount
        
        credentials.append({
            "credential_id": cred["credential_id"],
            "confirmation_number": cred["confirmation_number"],
            "scholarship_type": subject.get("scholarshipType", "Unknown"),
            "amount": amount,
            "issued_at": cred["issued_at"],
            "revoked": cred.get("revoked", False),
            "verify_url": f"{BASE_URL}/verify/{cred['credential_id']}",
        })
    
    return {
        "phone": phone,
        "total_credentials": len(credentials),
        "credentials": credentials,
        "total_amount": total_amount,
    }
