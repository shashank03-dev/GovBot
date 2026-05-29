from __future__ import annotations

import io
import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

DEFAULT_LOCAL_OCR_TIMEOUT_SECONDS = 4.0
DEFAULT_LOCAL_OCR_MAX_CHARS = 8_000
MAX_IMAGE_SIDE = 2_000


@dataclass(frozen=True)
class LocalOcrResult:
    text: str
    engine: str


def _clean_text(text: str, *, max_chars: int) -> str:
    lines = [line.strip() for line in str(text or "").replace("\x00", "").splitlines()]
    cleaned = "\n".join(line for line in lines if line)
    return cleaned[:max_chars].strip()


def _extract_pdf_text(content: bytes, *, max_pages: int, max_chars: int) -> str:
    import pdfplumber

    parts: list[str] = []
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for page in pdf.pages[:max_pages]:
            text = page.extract_text() or ""
            if text.strip():
                parts.append(text)
            if sum(len(part) for part in parts) >= max_chars:
                break
    return _clean_text("\n".join(parts), max_chars=max_chars)


def _prepare_image(content: bytes):
    from PIL import Image, ImageOps

    image = Image.open(io.BytesIO(content))
    image = ImageOps.exif_transpose(image)
    if image.mode not in {"RGB", "L"}:
        image = image.convert("RGB")

    width, height = image.size
    longest_side = max(width, height)
    if longest_side > MAX_IMAGE_SIDE:
        scale = MAX_IMAGE_SIDE / longest_side
        resampling = getattr(getattr(Image, "Resampling", Image), "LANCZOS")
        image = image.resize(
            (max(1, int(width * scale)), max(1, int(height * scale))),
            resample=resampling,
        )

    return ImageOps.grayscale(image)


def _extract_image_text(
    content: bytes,
    *,
    language: str,
    timeout_seconds: float,
    max_chars: int,
) -> str:
    import pytesseract

    image = _prepare_image(content)
    raw_text = pytesseract.image_to_string(
        image,
        lang=language,
        config="--oem 1 --psm 6",
        timeout=timeout_seconds,
    )
    return _clean_text(raw_text, max_chars=max_chars)


def extract_local_ocr_text(
    content: bytes,
    mime_type: Optional[str],
    *,
    language: str = "eng",
    timeout_seconds: float = DEFAULT_LOCAL_OCR_TIMEOUT_SECONDS,
    max_pages: int = 3,
    max_chars: int = DEFAULT_LOCAL_OCR_MAX_CHARS,
) -> Optional[LocalOcrResult]:
    normalized_mime = (mime_type or "").lower()
    if normalized_mime == "image/jpg":
        normalized_mime = "image/jpeg"

    if normalized_mime == "application/pdf":
        try:
            text = _extract_pdf_text(content, max_pages=max_pages, max_chars=max_chars)
        except Exception as exc:
            logger.info("Local PDF text extraction failed: %s", exc)
        else:
            if text:
                return LocalOcrResult(text=text, engine="pdfplumber")
        return None

    if normalized_mime.startswith("image/"):
        try:
            text = _extract_image_text(
                content,
                language=language,
                timeout_seconds=timeout_seconds,
                max_chars=max_chars,
            )
        except Exception as exc:
            logger.info("Local image OCR failed: %s", exc)
            return None
        if text:
            return LocalOcrResult(text=text, engine="tesseract")

    return None
