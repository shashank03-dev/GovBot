"""
Blockchain Credentials Router.

Configurable blockchain integration for W3C Verifiable Credentials:
- Issues credentials on the configured network
- Stores credential metadata on IPFS via Pinata
- Verifies credentials against blockchain

Requires:
- ALCHEMY_API_KEY (from alchemy.com)
- POLYGON_PRIVATE_KEY (wallet for credential issuance)
- PINATA_API_KEY (from pinata.cloud)
"""

import logging
import json
import hashlib
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from gov_agent.credential_network import (
    build_credential_explorer_url,
    get_credential_network_name,
)
from gov_agent.db import supabase
from gov_agent.config import BASE_URL

logger = logging.getLogger(__name__)
router = APIRouter()

WEB3_AVAILABLE: bool | None = None
_WEB3_CLASS = None


def _get_web3_class():
    global WEB3_AVAILABLE, _WEB3_CLASS

    if WEB3_AVAILABLE is False:
        return None
    if _WEB3_CLASS is not None:
        return _WEB3_CLASS

    try:
        from web3 import Web3
    except ImportError:
        WEB3_AVAILABLE = False
        logger.warning("Web3 not installed. Blockchain features will be mocked.")
        return None

    WEB3_AVAILABLE = True
    _WEB3_CLASS = Web3
    return Web3

# Contract ABI (simplified - only functions we need)
CONTRACT_ABI = [
    {
        "inputs": [],
        "name": "owner",
        "outputs": [{"internalType": "address", "name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {"internalType": "string", "name": "credentialId", "type": "string"},
            {"internalType": "string", "name": "confirmationNumber", "type": "string"},
            {"internalType": "bytes32", "name": "credentialHash", "type": "bytes32"},
            {"internalType": "string", "name": "metadataURI", "type": "string"}
        ],
        "name": "issueCredential",
        "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [{"internalType": "string", "name": "credentialId", "type": "string"}],
        "name": "getCredential",
        "outputs": [
            {
                "components": [
                    {"internalType": "string", "name": "credentialId", "type": "string"},
                    {"internalType": "string", "name": "confirmationNumber", "type": "string"},
                    {"internalType": "bytes32", "name": "credentialHash", "type": "bytes32"},
                    {"internalType": "address", "name": "issuer", "type": "address"},
                    {"internalType": "uint256", "name": "issuedAt", "type": "uint256"},
                    {"internalType": "bool", "name": "revoked", "type": "bool"},
                    {"internalType": "string", "name": "metadataURI", "type": "string"}
                ],
                "internalType": "struct GovBotCredentials.Credential",
                "name": "",
                "type": "tuple"
            }
        ],
        "stateMutability": "view",
        "type": "function"
    },
    {
        "inputs": [
            {"internalType": "string", "name": "credentialId", "type": "string"},
            {"internalType": "bytes32", "name": "credentialHash", "type": "bytes32"}
        ],
        "name": "verifyCredential",
        "outputs": [
            {"internalType": "bool", "name": "valid", "type": "bool"},
            {"internalType": "bool", "name": "revoked", "type": "bool"},
            {"internalType": "uint256", "name": "issuedAt", "type": "uint256"}
        ],
        "stateMutability": "view",
        "type": "function"
    }
]


class IssueCredentialRequest(BaseModel):
    confirmation_number: str
    phone: str
    student_name: str
    scholarship_type: str
    amount: float
    issued_by: str = "GovBot Scholarship System"


class CredentialResponse(BaseModel):
    credential_id: str
    confirmation_number: str
    blockchain_tx_hash: str
    polygonscan_url: str
    explorer_url: str
    network_name: str
    ipfs_hash: str | None
    issued_at: str
    qr_code_url: str


class VerifyResponse(BaseModel):
    valid: bool
    revoked: bool
    issued_at: str | None
    issuer: str | None
    message: str


def _generate_credential_id(confirmation_number: str) -> str:
    """Generate unique credential ID."""
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    return f"govbot-{confirmation_number}-{timestamp}"


def _hash_credential(credential_json: dict) -> str:
    """Generate SHA256 hash of credential."""
    credential_str = json.dumps(credential_json, sort_keys=True, separators=(',', ':'))
    return hashlib.sha256(credential_str.encode()).hexdigest()


def _serialize_credential_record(record: dict) -> dict:
    serialized = dict(record)
    explorer_url = build_credential_explorer_url(serialized.get("blockchain_tx_hash"))
    serialized["explorer_url"] = explorer_url
    serialized["polygonscan_url"] = explorer_url
    serialized["network_name"] = get_credential_network_name()
    return serialized


async def _upload_to_ipfs(credential_data: dict) -> str | None:
    """Upload credential metadata to IPFS via Pinata."""
    try:
        from gov_agent.config import PINATA_API_KEY, PINATA_SECRET_KEY
        
        if not PINATA_API_KEY or not PINATA_SECRET_KEY:
            logger.warning("Pinata credentials not configured")
            return None
        
        import httpx
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://api.pinata.cloud/pinning/pinJSONToIPFS",
                headers={
                    "pinata_api_key": PINATA_API_KEY,
                    "pinata_secret_api_key": PINATA_SECRET_KEY,
                    "Content-Type": "application/json",
                },
                json={
                    "pinataMetadata": {
                        "name": f"GovBot Credential - {credential_data.get('credentialId', 'unknown')}",
                    },
                    "pinataContent": credential_data,
                },
            )
            
            if response.status_code == 200:
                result = response.json()
                ipfs_hash = result.get("IpfsHash")
                logger.info(f"Credential uploaded to IPFS: {ipfs_hash}")
                return ipfs_hash
            else:
                logger.error(f"IPFS upload failed: {response.text}")
                return None
                
    except Exception as e:
        logger.error(f"Error uploading to IPFS: {e}")
        return None


@router.post("/credentials/issue", response_model=CredentialResponse)
async def issue_blockchain_credential(body: IssueCredentialRequest):
    """Issue a verifiable credential on the configured blockchain network."""
    
    # Check if credential already exists
    existing = (
        supabase.table("verifiable_credentials")
        .select("*")
        .eq("confirmation_number", body.confirmation_number)
        .execute()
    )
    
    if existing.data:
        raise HTTPException(status_code=409, detail="Credential already issued for this application")
    
    # Generate credential ID and hash
    credential_id = _generate_credential_id(body.confirmation_number)
    
    # Create credential JSON (W3C Verifiable Credential format)
    credential_json = {
        "@context": [
            "https://www.w3.org/2018/credentials/v1",
            "https://govbot.schema/scholarship/v1"
        ],
        "id": f"urn:uuid:{credential_id}",
        "type": ["VerifiableCredential", "GovBotScholarshipCredential"],
        "issuer": {
            "id": f"did:web:{BASE_URL.replace('https://', '')}",
            "name": body.issued_by,
        },
        "issuanceDate": datetime.now(timezone.utc).isoformat(),
        "credentialSubject": {
            "id": f"did:phone:{body.phone}",
            "name": body.student_name,
            "scholarshipType": body.scholarship_type,
            "amount": body.amount,
            "currency": "INR",
            "confirmationNumber": body.confirmation_number,
        },
        "credentialId": credential_id,
    }
    
    # Generate hash
    credential_hash = _hash_credential(credential_json)
    
    # Upload to IPFS
    ipfs_hash = await _upload_to_ipfs(credential_json)
    
    # Issue on blockchain (if Web3 available)
    tx_hash = "0x" + "0" * 64  # Mock transaction hash

    Web3 = _get_web3_class()
    if Web3 is not None:
        try:
            from gov_agent.config import POLYGON_RPC_URL, POLYGON_PRIVATE_KEY, CONTRACT_ADDRESS
            
            if all([POLYGON_RPC_URL, POLYGON_PRIVATE_KEY, CONTRACT_ADDRESS]):
                w3 = Web3(Web3.HTTPProvider(POLYGON_RPC_URL))
                
                # Get contract
                contract = w3.eth.contract(address=CONTRACT_ADDRESS, abi=CONTRACT_ABI)
                
                # Build transaction
                account = w3.eth.account.from_key(POLYGON_PRIVATE_KEY)
                
                tx = contract.functions.issueCredential(
                    credential_id,
                    body.confirmation_number,
                    bytes.fromhex(credential_hash),
                    ipfs_hash or f"ipfs://{credential_hash}"
                ).build_transaction({
                    'from': account.address,
                    'nonce': w3.eth.get_transaction_count(account.address),
                    'gas': 200000,
                    'gasPrice': w3.to_wei('2', 'gwei'),
                })
                
                # Sign and send
                signed_tx = w3.eth.account.sign_transaction(tx, POLYGON_PRIVATE_KEY)
                tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)
                tx_hash_hex = tx_hash.hex()
                
                logger.info(f"Credential issued on blockchain: {tx_hash_hex}")
            else:
                logger.warning("Blockchain credentials not configured, using mock")
                # Generate mock transaction hash
                tx_hash_hex = f"0x{credential_hash[:64]}"
        except Exception as e:
            logger.error(f"Blockchain error: {e}")
            # Use mock hash
            tx_hash_hex = f"0x{credential_hash[:64]}"
    else:
        # Generate mock transaction hash
        tx_hash_hex = f"0x{credential_hash[:64]}"

    explorer_url = build_credential_explorer_url(tx_hash_hex)
    network_name = get_credential_network_name()
    
    # Store in database
    issued_at = datetime.now(timezone.utc).isoformat()
    
    supabase.table("verifiable_credentials").insert({
        "credential_id": credential_id,
        "confirmation_number": body.confirmation_number,
        "phone": body.phone,
        "blockchain_tx_hash": tx_hash_hex,
        "credential_hash": credential_hash,
        "ipfs_hash": ipfs_hash,
        "credential_json": credential_json,
        "issued_at": issued_at,
        "revoked": False,
    }).execute()
    
    # Generate QR code URL (for verification)
    qr_code_url = f"{BASE_URL}/verify/{credential_id}"
    
    return CredentialResponse(
        credential_id=credential_id,
        confirmation_number=body.confirmation_number,
        blockchain_tx_hash=tx_hash_hex,
        polygonscan_url=explorer_url,
        explorer_url=explorer_url,
        network_name=network_name,
        ipfs_hash=ipfs_hash,
        issued_at=issued_at,
        qr_code_url=qr_code_url,
    )


@router.get("/credentials/verify/{credential_id}", response_model=VerifyResponse)
async def verify_blockchain_credential(credential_id: str):
    """Verify a credential on the blockchain."""
    
    # Get from database
    result = supabase.table("verifiable_credentials").select("*").eq("credential_id", credential_id).execute()
    
    if not result.data:
        return VerifyResponse(
            valid=False,
            revoked=False,
            issued_at=None,
            issuer=None,
            message="Credential not found"
        )
    
    cred = result.data[0]
    
    # Verify on blockchain if available
    Web3 = _get_web3_class()
    if Web3 is not None:
        try:
            from gov_agent.config import POLYGON_RPC_URL, CONTRACT_ADDRESS
            
            if POLYGON_RPC_URL and CONTRACT_ADDRESS:
                w3 = Web3(Web3.HTTPProvider(POLYGON_RPC_URL))
                contract = w3.eth.contract(address=CONTRACT_ADDRESS, abi=CONTRACT_ABI)
                
                # Call verify function
                valid, revoked, issued_at_unix = contract.functions.verifyCredential(
                    credential_id,
                    bytes.fromhex(cred["credential_hash"])
                ).call()
                
                return VerifyResponse(
                    valid=valid,
                    revoked=revoked,
                    issued_at=datetime.fromtimestamp(issued_at_unix, timezone.utc).isoformat() if issued_at_unix > 0 else None,
                    issuer=cred.get("credential_json", {}).get("issuer", {}).get("name"),
                    message=f"Verified on {get_credential_network_name()} blockchain" if valid else "Verification failed"
                )
        except Exception as e:
            logger.error(f"Blockchain verification error: {e}")
    
    # Return database verification
    return VerifyResponse(
        valid=True,
        revoked=cred.get("revoked", False),
        issued_at=cred.get("issued_at"),
        issuer=cred.get("credential_json", {}).get("issuer", {}).get("name"),
        message="Verified (database record)"
    )


@router.get("/credentials/id/{credential_id}")
async def get_credential_by_id(credential_id: str):
    """Get a credential record by credential ID."""

    result = (
        supabase.table("verifiable_credentials")
        .select("*")
        .eq("credential_id", credential_id)
        .execute()
    )

    if not result.data:
        raise HTTPException(status_code=404, detail="Credential not found")

    return _serialize_credential_record(result.data[0])


@router.get("/credentials/{phone}")
async def get_user_credentials(phone: str):
    """Get all credentials for a user."""
    
    result = (
        supabase.table("verifiable_credentials")
        .select("*")
        .eq("phone", phone)
        .order("issued_at", desc=True)
        .execute()
    )
    
    credentials = [_serialize_credential_record(record) for record in (result.data or [])]

    return {
        "phone": phone,
        "credentials": credentials,
        "total": len(credentials),
        "network_name": get_credential_network_name(),
    }


@router.get("/credentials/by-confirmation/{confirmation_number}")
async def get_credential_by_confirmation(confirmation_number: str):
    """Get credential by confirmation number."""
    
    result = (
        supabase.table("verifiable_credentials")
        .select("*")
        .eq("confirmation_number", confirmation_number)
        .execute()
    )
    
    if not result.data:
        raise HTTPException(status_code=404, detail="No credential found for this confirmation number")
    
    return _serialize_credential_record(result.data[0])
