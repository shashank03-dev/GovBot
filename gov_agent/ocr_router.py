import logging
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from gov_agent.document_vault import DocumentVaultError, ingest_document

logger = logging.getLogger(__name__)
router = APIRouter()


class OcrRequest(BaseModel):
    media_id: Optional[str] = None
    image_b64: Optional[str] = None
    session_id: Optional[str] = None
    phone: Optional[str] = None
    file_name: Optional[str] = None
    mime_type: Optional[str] = None


@router.post("/extract")
async def extract_ocr(req: OcrRequest):
    if not req.media_id and not req.image_b64:
        return {"error": "Provide media_id or image_b64"}

    try:
        result = await ingest_document(
            phone=req.phone or "ocr-anonymous",
            doc_type="aadhaar",
            source="whatsapp" if req.media_id else "web",
            image_b64=req.image_b64,
            media_id=req.media_id,
            session_id=req.session_id,
            file_name=req.file_name,
            mime_type=req.mime_type,
        )
    except DocumentVaultError as exc:
        logger.error("OCR extraction failed: %s", exc)
        return {"error": exc.message}
    except Exception as exc:
        logger.error("OCR extraction failed: %s", exc)
        return {"error": f"OCR extraction failed: {exc}"}

    extracted = result.get("extracted_data") or {}
    return {
        "name": extracted.get("full_name", ""),
        "dob": extracted.get("dob", ""),
        "aadhaar_number": extracted.get("aadhaar_number", ""),
        "address": extracted.get("address", ""),
        "gender": extracted.get("gender", ""),
        "field_map": extracted,
        "confidence": float(result.get("confidence", 0.0) or 0.0),
        "document_id": result.get("id"),
        "status": result.get("status"),
    }
