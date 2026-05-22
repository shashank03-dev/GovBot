from datetime import datetime
from typing import Any, Literal, Optional, List

from pydantic import BaseModel


class UserSession(BaseModel):
    """
    Represents the current session state and collected data for a given user.
    """
    phone: str
    state: str
    collected_data: dict
    updated_at: datetime


class ApplicationRecord(BaseModel):
    """
    Represents a submitted service application record tied to a user.
    """
    phone: str
    confirmation_number: str
    service: str
    status: str
    submitted_at: datetime


class WhatsAppIncoming(BaseModel):
    """
    Represents an incoming message from the WhatsApp API.
    """
    phone: str
    message_type: Literal["text", "image", "document"]
    body: Optional[str] = None
    media_id: Optional[str] = None
    mime_type: Optional[str] = None
    file_name: Optional[str] = None


class EligibilityRequest(BaseModel):
    income: int
    caste: Literal["SC", "ST", "OBC", "General"]
    course_level: Literal["pre_matric", "post_matric", "degree"]
    marks_pct: float
    session_id: Optional[str] = None


class EligibilityResult(BaseModel):
    eligible: bool
    schemes: List[str]
    reasons: List[str]


class OcrExtractionResult(BaseModel):
    name: str
    dob: str
    aadhaar_number: str
    address: str
    gender: str
    field_map: dict[str, Any]
    confidence: float


class DocumentCheckRequest(BaseModel):
    session_id: Optional[str] = None
    doc_type: Literal["income_cert", "caste_cert", "marksheet", "aadhaar"]
    image_b64: str


class DocumentCheckResult(BaseModel):
    valid: bool
    doc_type: str
    issue_date: Optional[str]
    expiry_date: Optional[str]
    flags: list[str]
    message: str


class DocumentUploadRequest(BaseModel):
    phone: str
    doc_type: Literal["pan", "aadhaar", "income_cert", "caste_cert", "marksheet"]
    source: Literal["web", "whatsapp", "digilocker"]
    image_b64: Optional[str] = None
    media_id: Optional[str] = None
    session_id: Optional[str] = None
    file_name: Optional[str] = None
    mime_type: Optional[str] = None


class DocumentEditRequest(BaseModel):
    extracted_data: dict[str, Any]


class LiveSessionState(BaseModel):
    session_id: str
    phone: str
    portal: str
    step: int
    total_steps: int
    form_state: dict[str, Any]
    status: str


class PortalConfig(BaseModel):
    """Configuration for a scholarship portal."""
    portal_id: str
    name: str
    scheme_type: str
    ministry: str
    eligibility_rules: dict


class PortalApplyRequest(BaseModel):
    """Request to apply via a specific portal."""
    name: str
    dob: str
    income: int
    media_id: str
    phone: str
    caste: Optional[str] = None
    marks_pct: Optional[float] = None
    religion: Optional[str] = None
    institution: Optional[str] = None
    course: Optional[str] = None


class PortalApplyResponse(BaseModel):
    """Response from portal application."""
    status: str
    confirmation_number: Optional[str] = None
    error: Optional[str] = None


class RenewalReminder(BaseModel):
    """Renewal reminder registration."""
    phone: str
    portal: str
    renewal_due_date: str


class FraudFlag(BaseModel):
    """Fraud detection flag for duplicate Aadhaar."""
    aadhaar_hash: str
    phones: list[str]
    portal: Optional[str] = None
    flagged_at: Optional[str] = None
