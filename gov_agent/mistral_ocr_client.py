from __future__ import annotations

import httpx

from gov_agent.config import MISTRAL_API_KEY, MISTRAL_OCR_ENABLED, MISTRAL_OCR_MODEL

MISTRAL_OCR_URL = "https://api.mistral.ai/v1/ocr"


def has_mistral_ocr_client() -> bool:
    return bool(MISTRAL_OCR_ENABLED and MISTRAL_API_KEY)


def _document_payload(*, data_b64: str, mime_type: str) -> dict[str, str]:
    normalized_mime = mime_type or "image/jpeg"
    data_url = f"data:{normalized_mime};base64,{data_b64}"
    if normalized_mime.startswith("image/"):
        return {"type": "image_url", "image_url": data_url}
    return {"type": "document_url", "document_url": data_url}


def extract_ocr_markdown(*, data_b64: str, mime_type: str) -> str:
    if not MISTRAL_API_KEY:
        raise RuntimeError("MISTRAL_API_KEY is not configured")

    response = httpx.post(
        MISTRAL_OCR_URL,
        headers={
            "Authorization": f"Bearer {MISTRAL_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "model": MISTRAL_OCR_MODEL,
            "document": _document_payload(data_b64=data_b64, mime_type=mime_type),
            "include_image_base64": False,
        },
        timeout=30.0,
    )
    response.raise_for_status()
    data = response.json()
    pages = data.get("pages") or []
    markdown = "\n\n".join(
        str(page.get("markdown") or "").strip()
        for page in pages
        if isinstance(page, dict) and str(page.get("markdown") or "").strip()
    ).strip()
    if not markdown:
        raise RuntimeError("Mistral OCR returned no markdown")
    return markdown
