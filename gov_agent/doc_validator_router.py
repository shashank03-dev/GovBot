import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from gov_agent.document_vault import (
    DocumentVaultError,
    analyze_document_validity,
    create_signed_download_url,
    create_signed_document_url,
    delete_user_document,
    ensure_profile_passkey,
    get_user_document,
    has_profile_passkey,
    ingest_document,
    list_user_documents,
    log_document_access,
    set_profile_passkey,
    update_user_document,
)
from gov_agent.models import DocumentEditRequest, DocumentUploadRequest
from gov_agent.user_auth import optional_jwt as _optional_jwt
from gov_agent.user_auth import normalize_phone, require_phone_access

logger = logging.getLogger(__name__)
router = APIRouter()


def _vault_http_exception(exc: DocumentVaultError) -> HTTPException:
    status_map = {
        "upload": 400,
        "ocr": 422,
        "storage": 502,
        "passkey_required": 401,
        "passkey_invalid": 403,
        "passkey_not_set": 428,
    }
    return HTTPException(status_code=status_map.get(exc.code, 500), detail=exc.message)


def _require_token_phone(token_phone: Optional[str]) -> str:
    if not token_phone:
        raise HTTPException(status_code=401, detail="Authentication required")
    return token_phone


def _require_document_passkey(request: Request, phone: str) -> None:
    pin = request.headers.get("X-Document-Passkey")
    try:
        ensure_profile_passkey(phone, pin)
    except DocumentVaultError as exc:
        raise _vault_http_exception(exc) from exc


class DocValidateRequest(BaseModel):
    doc_type: str
    image_b64: str
    session_id: Optional[str] = None
    phone: Optional[str] = None


class SetPasskeyRequest(BaseModel):
    new_passkey: str
    current_passkey: Optional[str] = None
    phone: Optional[str] = None


@router.get("/passkey-status")
async def get_passkey_status(
    token_phone: Optional[str] = Depends(_optional_jwt),
):
    phone = _require_token_phone(token_phone)
    return {"phone": phone, "has_passkey": has_profile_passkey(phone)}


@router.post("/passkey")
async def set_passkey(
    req: SetPasskeyRequest,
    token_phone: Optional[str] = Depends(_optional_jwt),
):
    resolved_phone = require_phone_access(req.phone, token_phone)
    try:
        set_profile_passkey(resolved_phone, req.new_passkey, current_pin=req.current_passkey)
    except DocumentVaultError as exc:
        raise _vault_http_exception(exc) from exc
    return {"phone": resolved_phone, "has_passkey": True}


@router.post("/validate")
async def validate_document(req: DocValidateRequest):
    result = analyze_document_validity(req.doc_type, req.image_b64)
    return result


@router.post("/upload")
async def upload_document(
    req: DocumentUploadRequest,
    token_phone: Optional[str] = Depends(_optional_jwt),
):
    resolved_phone = require_phone_access(req.phone, token_phone)
    try:
        return await ingest_document(
            phone=resolved_phone,
            doc_type=req.doc_type,
            source=req.source,
            image_b64=req.image_b64,
            media_id=req.media_id,
            session_id=req.session_id,
            file_name=req.file_name,
            mime_type=req.mime_type,
            custom_label=req.custom_label,
        )
    except DocumentVaultError as exc:
        raise _vault_http_exception(exc) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Document upload failed: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/item/{document_id}")
async def get_document_item(
    document_id: str,
    request: Request,
    token_phone: Optional[str] = Depends(_optional_jwt),
):
    _require_token_phone(token_phone)
    document = get_user_document(document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    if token_phone != normalize_phone(document.get("phone")):
        raise HTTPException(status_code=403, detail="Access denied")
    _require_document_passkey(request, document["phone"])
    return document


@router.post("/item/{document_id}/signed-url")
async def create_document_signed_url(
    document_id: str,
    request: Request,
    token_phone: Optional[str] = Depends(_optional_jwt),
):
    _require_token_phone(token_phone)
    document = get_user_document(document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    if token_phone != normalize_phone(document.get("phone")):
        raise HTTPException(status_code=403, detail="Access denied")
    _require_document_passkey(request, document["phone"])
    signed_url = create_signed_document_url(document["storage_path"])
    try:
        log_document_access(
            phone=document["phone"],
            document_id=document_id,
            action="preview",
            metadata={"source": "web"},
        )
    except Exception as exc:
        logger.warning("Document access log failed for preview %s: %s", document_id, exc)
    return {"document_id": document_id, "signed_url": signed_url}


@router.post("/item/{document_id}/view-url")
async def create_document_view_url(
    document_id: str,
    request: Request,
    token_phone: Optional[str] = Depends(_optional_jwt),
):
    _require_token_phone(token_phone)
    document = get_user_document(document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    if token_phone != normalize_phone(document.get("phone")):
        raise HTTPException(status_code=403, detail="Access denied")
    _require_document_passkey(request, document["phone"])
    view_url = create_signed_document_url(document["storage_path"])
    try:
        log_document_access(
            phone=document["phone"],
            document_id=document_id,
            action="preview",
            metadata={"source": "web"},
        )
    except Exception as exc:
        logger.warning("Document access log failed for preview %s: %s", document_id, exc)
    return {"document_id": document_id, "view_url": view_url}


@router.post("/item/{document_id}/download-url")
async def create_document_download_url(
    document_id: str,
    request: Request,
    token_phone: Optional[str] = Depends(_optional_jwt),
):
    _require_token_phone(token_phone)
    document = get_user_document(document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    if token_phone != normalize_phone(document.get("phone")):
        raise HTTPException(status_code=403, detail="Access denied")
    _require_document_passkey(request, document["phone"])
    download_url = create_signed_download_url(document["storage_path"])
    try:
        log_document_access(
            phone=document["phone"],
            document_id=document_id,
            action="download",
            metadata={"source": "web"},
        )
    except Exception as exc:
        logger.warning("Document access log failed for download %s: %s", document_id, exc)
    return {"document_id": document_id, "download_url": download_url}


@router.patch("/item/{document_id}")
async def update_document_item(
    document_id: str,
    req: DocumentEditRequest,
    request: Request,
    token_phone: Optional[str] = Depends(_optional_jwt),
):
    _require_token_phone(token_phone)
    document = get_user_document(document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    if token_phone != normalize_phone(document.get("phone")):
        raise HTTPException(status_code=403, detail="Access denied")
    _require_document_passkey(request, document["phone"])
    updated = update_user_document(document_id, req.extracted_data, custom_label=req.custom_label)
    if not updated:
        raise HTTPException(status_code=404, detail="Document not found")
    try:
        log_document_access(
            phone=document["phone"],
            document_id=document_id,
            action="edit",
            metadata={"fields": sorted(req.extracted_data.keys())},
        )
    except Exception as exc:
        logger.warning("Document access log failed for edit %s: %s", document_id, exc)
    return updated


@router.delete("/item/{document_id}")
async def delete_document_item(
    document_id: str,
    request: Request,
    token_phone: Optional[str] = Depends(_optional_jwt),
):
    _require_token_phone(token_phone)
    document = get_user_document(document_id)
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    if token_phone and token_phone != document.get("phone"):
        raise HTTPException(status_code=403, detail="Access denied")
    _require_document_passkey(request, document["phone"])
    try:
        log_document_access(
            phone=document["phone"],
            document_id=document_id,
            action="delete",
            metadata={"doc_type": document.get("doc_type")},
        )
    except Exception as exc:
        logger.warning("Document access log failed for delete %s: %s", document_id, exc)
    delete_user_document(document_id)
    return {"deleted": True, "document_id": document_id}


@router.get("/{phone}")
async def get_documents_for_phone(
    phone: str,
    token_phone: Optional[str] = Depends(_optional_jwt),
):
    resolved_phone = require_phone_access(phone, token_phone)
    return {"phone": resolved_phone, "documents": list_user_documents(resolved_phone)}
