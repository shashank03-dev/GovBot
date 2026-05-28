import base64
import os
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parent.parent

INCOME_CASTE_CERTIFICATE = {
    "certificate_number": "RD1218190096391",
    "student_name": "SHASHANK GOWDA T",
    "father_name": "THIMMARAJU T",
    "mother_name": "ANUSUYA",
    "address": "#3, Near Arch, Doddabidarakallu, Nagasandra, Bengaluru 560073",
    "annual_income": 98000,
    "income_category": "Below 1 Lakh",
    "caste": "Vokkaligaru",
    "category": "Category III A (Backward Classes)",
    "normalized_category": "obc",
    "taluk": "Bengaluru North",
    "district": "Bengaluru Urban",
    "issuing_authority": "Tahsildar, Bengaluru North Taluk",
    "issue_date": "2026-01-29",
    "valid_until": "2031-01-29",
}

MARKSHEET = {
    "student_name": "SHASHANK GOWDA T",
    "father_name": "THIMMARAJU T",
    "mother_name": "ANUSUYA",
    "gender": "MALE",
    "register_number": "20259115638",
    "roll_number": "20259115638",
    "year": "2025",
    "board": "Karnataka School Examination and Assessment Board",
    "medium": "ENGLISH",
    "candidate_type": "REGULAR",
    "percentage": 95.5,
    "marks_obtained": 573,
    "max_marks": 600,
    "class_obtained": "DISTINCTION",
    "college": "AN0840, VIDYASOUDHA PU COLLEGE, NR KSRTC BUSSTOP PEENYA I, BENGALURU",
    "college_code": "560058",
    "issue_date": "2025-01-01",
}

DEMO_DOCUMENT_FILES = {
    "income_certificate": "WhatsApp Image 2026-05-28 at 7.04.57 PM.jpeg",
    "caste_certificate": "WhatsApp Image 2026-05-28 at 7.04.57 PM.jpeg",
    "income_cert": "WhatsApp Image 2026-05-28 at 7.04.57 PM.jpeg",
    "caste_cert": "WhatsApp Image 2026-05-28 at 7.04.57 PM.jpeg",
    "marksheet": "IMG_20250722_134905.jpg",
}


def _demo_document_dirs() -> list[Path]:
    dirs: list[Path] = []
    configured = os.getenv("GOVBOT_DEMO_DOCUMENT_DIR")
    if configured:
        dirs.append(Path(configured).expanduser())
    dirs.extend([Path.cwd(), REPO_ROOT, Path.home() / "Downloads"])

    unique: list[Path] = []
    seen: set[Path] = set()
    for directory in dirs:
        resolved = directory.resolve()
        if resolved not in seen:
            unique.append(resolved)
            seen.add(resolved)
    return unique


def load_demo_document_asset(doc_type: str) -> dict[str, Any] | None:
    file_name = DEMO_DOCUMENT_FILES.get(doc_type)
    if not file_name:
        return None

    for directory in _demo_document_dirs():
        path = directory / file_name
        if not path.exists() or not path.is_file():
            continue
        content = path.read_bytes()
        return {
            "data": base64.b64encode(content).decode("ascii"),
            "size": len(content),
            "mime_type": "image/jpeg",
            "file_name": file_name,
        }
    return None
