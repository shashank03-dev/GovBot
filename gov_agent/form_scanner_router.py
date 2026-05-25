"""
Form Scanner router for GovBot.

Universal auto-fill engine: given any government portal URL, uses Playwright to
extract form fields, then Gemini to map them to the citizen profile, then fills
the form automatically.

Routes:
  POST /form-scanner/analyze  — extract fields + map to profile (no fill)
  POST /form-scanner/fill     — actually fill the form via Playwright + screenshot
  GET  /form-scanner/history/{phone} — fill session history
"""

import ipaddress
import json
import logging
import os
import socket
import uuid
from datetime import datetime, timezone
import glob
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

SCREENSHOT_DIR = os.environ.get("SCREENSHOT_DIR", "/tmp/govbot_screenshots")
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

from gov_agent.db import supabase
from gov_agent.gemini_client import generate_text, has_gemini_client

logger = logging.getLogger(__name__)
router = APIRouter()

# ---------------------------------------------------------------------------
# Citizen profile fields that the mapper can target
# ---------------------------------------------------------------------------
PROFILE_FIELD_DESCRIPTIONS = {
    "full_name": "Applicant's full name",
    "dob": "Date of birth (DD/MM/YYYY or YYYY-MM-DD)",
    "gender": "Gender (Male/Female/Other)",
    "aadhaar_last4": "Last 4 digits of Aadhaar number",
    "address": "Full residential address",
    "state": "State of residence",
    "district": "District of residence",
    "pincode": "PIN code",
    "income": "Annual family income in rupees",
    "caste": "Caste category (general/obc/sc/st/ews)",
    "religion": "Religion",
    "course_level": "Course level (pre_matric/post_matric/degree/pg)",
    "institution": "Name of institution or college",
    "marks_pct": "Marks percentage in last exam",
    "bank_account": "Bank account number",
    "bank_ifsc": "Bank IFSC code",
    "bank_name": "Bank name",
    "father_name": "Father's name",
    "mother_name": "Mother's name",
    "email": "Email address",
}


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------
class FormAnalyzeRequest(BaseModel):
    url: str
    phone: str


class FormFillRequest(BaseModel):
    url: str
    phone: str
    field_map: Dict[str, str]
    confirm: bool = False


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _validate_public_url(url: str) -> None:
    """Raise HTTPException if URL points to private/reserved IP ranges (SSRF guard)."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Only http/https URLs are allowed")
    hostname = parsed.hostname or ""
    if not hostname:
        raise HTTPException(status_code=400, detail="Invalid URL: missing hostname")
    try:
        ip = ipaddress.ip_address(socket.gethostbyname(hostname))
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            raise HTTPException(status_code=400, detail="Private or reserved URLs are not allowed")
    except socket.gaierror:
        pass  # DNS failure — Playwright will handle timeout naturally
    except HTTPException:
        raise
    except ValueError:
        pass  # Not a bare IP address — hostname only


async def _get_profile(phone: str) -> dict:
    try:
        resp = supabase.table("citizen_profiles").select("*").eq("phone", phone).limit(1).execute()
        return resp.data[0] if resp.data else {}
    except Exception:
        return {}


async def _extract_form_fields(url: str) -> List[Dict[str, str]]:
    """Use Playwright to extract all form fields from a URL."""
    try:
        from playwright.async_api import async_playwright
        async with async_playwright() as p:
            browser = await _launch_playwright_browser(p)
            page = await browser.new_page()
            await page.goto(url, timeout=30000, wait_until="domcontentloaded")
            await page.wait_for_timeout(2000)

            fields = await page.evaluate("""
                () => {
                    const results = [];
                    const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea');
                    inputs.forEach(el => {
                        const label = (
                            document.querySelector(`label[for="${el.id}"]`)?.innerText ||
                            el.closest('label')?.innerText ||
                            el.getAttribute('placeholder') ||
                            el.getAttribute('aria-label') ||
                            ''
                        ).trim().replace(/\\s+/g, ' ').substring(0, 80);
                        if (label || el.name || el.id) {
                            results.push({
                                label: label,
                                name: el.name || '',
                                id: el.id || '',
                                type: el.type || el.tagName.toLowerCase(),
                                placeholder: el.getAttribute('placeholder') || '',
                            });
                        }
                    });
                    return results.slice(0, 50);
                }
            """)
            await browser.close()
            return fields or []
    except Exception as e:
        logger.warning(f"Playwright field extraction failed: {e}")
        return []


def _heuristic_map_fields(form_fields: List[Dict[str, str]]) -> Dict[str, str]:
    """Map common public-form labels to GovBot profile fields without AI help."""
    mappings: Dict[str, str] = {}

    for field in form_fields:
        field_key = field.get("name") or field.get("id")
        if not field_key:
            continue

        text = " ".join(
            [
                field.get("label", ""),
                field.get("name", ""),
                field.get("id", ""),
                field.get("placeholder", ""),
            ]
        ).lower()

        if "address" in text or "street" in text:
            mappings[field_key] = "address"
        elif "district" in text or "city" in text:
            mappings[field_key] = "district"
        elif "state" in text or "province" in text:
            mappings[field_key] = "state"
        elif "zip" in text or "postal" in text or "pin" in text:
            mappings[field_key] = "pincode"
        elif "email" in text:
            mappings[field_key] = "email"
        elif "income" in text:
            mappings[field_key] = "income"
        elif "religion" in text:
            mappings[field_key] = "religion"
        elif "caste" in text or "category" in text:
            mappings[field_key] = "caste"
        elif "aadhaar" in text:
            mappings[field_key] = "aadhaar_last4"
        elif "date of birth" in text or " dob " in f" {text} ":
            mappings[field_key] = "dob"
        elif "gender" in text or "sex" in text:
            mappings[field_key] = "gender"
        elif "bank name" in text:
            mappings[field_key] = "bank_name"
        elif "ifsc" in text:
            mappings[field_key] = "bank_ifsc"
        elif "account number" in text or ("bank" in text and "account" in text):
            mappings[field_key] = "bank_account"
        elif "father" in text:
            mappings[field_key] = "father_name"
        elif "mother" in text:
            mappings[field_key] = "mother_name"
        elif "institution" in text or "college" in text or "school" in text:
            mappings[field_key] = "institution"
        elif "course" in text or "class" in text or "programme" in text or "program" in text:
            mappings[field_key] = "course_level"
        elif "marks" in text or "percentage" in text:
            mappings[field_key] = "marks_pct"
        elif "full name" in text or ("applicant" in text and "name" in text):
            mappings[field_key] = "full_name"

    return mappings


def _find_fallback_chromium_executable() -> Optional[str]:
    explicit = os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE", "").strip()
    cached = sorted(
        glob.glob(os.path.expanduser("~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome")),
        reverse=True,
    )
    candidates = [
        explicit,
        *cached,
        "/opt/google/chrome/chrome",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium",
    ]

    for candidate in candidates:
        if candidate and os.path.isfile(candidate):
            return candidate
    return None


async def _launch_playwright_browser(playwright) -> Any:
    launch_attempts = [{"headless": True}]
    fallback_executable = _find_fallback_chromium_executable()
    if fallback_executable:
        launch_attempts.append({"headless": True, "executable_path": fallback_executable})

    last_error = None
    for launch_kwargs in launch_attempts:
        try:
            return await playwright.chromium.launch(**launch_kwargs)
        except Exception as exc:  # pragma: no cover - exercised in browser validation
            last_error = exc
            logger.warning("Playwright launch failed with %s: %s", launch_kwargs, exc)

    raise last_error or RuntimeError("Unable to launch Playwright browser")


async def _map_fields_with_gemini(form_fields: List[Dict[str, str]]) -> Dict[str, str]:
    """Use Gemini to map extracted form field labels to citizen profile fields."""
    if not form_fields:
        return {}

    heuristic_map = _heuristic_map_fields(form_fields)
    if not has_gemini_client():
        return heuristic_map

    try:
        field_list_text = "\n".join(
            f"- label='{f.get('label', '')}' name='{f.get('name', '')}' id='{f.get('id', '')}' placeholder='{f.get('placeholder', '')}'"
            for f in form_fields
        )
        profile_fields_text = "\n".join(
            f"  {k}: {v}" for k, v in PROFILE_FIELD_DESCRIPTIONS.items()
        )
        prompt = f"""You are a form field mapper for Indian government portals.

Available citizen profile fields:
{profile_fields_text}

Form fields found on the page:
{field_list_text}

Task: For each form field, identify the best matching citizen profile field key.
Return ONLY a JSON object mapping form field identifiers to profile field keys.
Use the form field's name or id as the key, and the profile field key as the value.
If no match exists, omit that field.
Only use profile field keys from the list above.

Example output:
{{"applicant_name": "full_name", "date_birth": "dob", "annual_income": "income"}}

Return only valid JSON, no explanation."""

        raw = generate_text(
            prompt,
            response_mime_type="application/json",
            temperature=0.1,
        )
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        ai_map = json.loads(raw)
        merged = dict(heuristic_map)
        merged.update({k: v for k, v in ai_map.items() if v in PROFILE_FIELD_DESCRIPTIONS})
        return merged
    except Exception as e:
        logger.warning(f"Gemini field mapping failed: {e}")
        return heuristic_map


def _build_fill_values(field_map: Dict[str, str], profile: dict) -> tuple[Dict[str, Any], List[str]]:
    """Build actual fill values from profile, return (values_dict, missing_profile_fields)."""
    values: Dict[str, Any] = {}
    missing: List[str] = []
    for form_field_id, profile_key in field_map.items():
        val = profile.get(profile_key)
        if val is not None and str(val).strip():
            values[form_field_id] = str(val)
        else:
            missing.append(profile_key)
    return values, missing


async def _playwright_fill(url: str, fill_values: Dict[str, Any], form_fields: List[Dict]) -> Dict[str, Any]:
    """Fill form fields using Playwright. Returns dict with screenshot_path and actually_filled count."""
    try:
        from playwright.async_api import async_playwright

        # Build deduplicated id→value and name→value maps (prefer id over name to avoid double-fill)
        id_map: Dict[str, str] = {}
        name_map: Dict[str, str] = {}
        seen_keys: set = set()
        for field_info in form_fields:
            fid = field_info.get("id", "")
            fname = field_info.get("name", "")
            for key, val in fill_values.items():
                if fid and fid == key and fid not in seen_keys:
                    id_map[fid] = val
                    seen_keys.add(fid)
                elif fname and fname == key and fname not in seen_keys:
                    name_map[fname] = val
                    seen_keys.add(fname)

        async with async_playwright() as p:
            browser = await _launch_playwright_browser(p)
            page = await browser.new_page()
            await page.goto(url, timeout=30000, wait_until="domcontentloaded")
            await page.wait_for_timeout(1500)

            filled = 0
            for sel, val in id_map.items():
                try:
                    el = page.locator(f"#{sel}").first
                    if await el.count() > 0:
                        await el.fill(str(val))
                        filled += 1
                except Exception:
                    pass
            for sel, val in name_map.items():
                try:
                    el = page.locator(f"[name='{sel}']").first
                    if await el.count() > 0:
                        await el.fill(str(val))
                        filled += 1
                except Exception:
                    pass

            screenshot_bytes = await page.screenshot(full_page=True)
            await browser.close()

            fname_ss = f"{uuid.uuid4().hex[:12]}.png"
            fpath = os.path.join(SCREENSHOT_DIR, fname_ss)
            with open(fpath, "wb") as f:
                f.write(screenshot_bytes)
            return {"screenshot_path": fname_ss, "actually_filled": filled}
    except Exception as e:
        logger.warning(f"Playwright fill failed: {e}")
        return {"screenshot_path": None, "actually_filled": 0}


async def _save_session(phone: str, url: str, field_map: dict, filled_count: int,
                        missing_fields: list, screenshot_path: Optional[str], status: str) -> str:
    try:
        record = {
            "phone": phone,
            "url": url,
            "field_map": field_map,
            "filled_count": filled_count,
            "missing_fields": missing_fields,
            "screenshot_path": screenshot_path,
            "status": status,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        resp = supabase.table("form_fill_sessions").insert(record).execute()
        if resp.data:
            return resp.data[0].get("id", "")
    except Exception as e:
        logger.warning(f"save session error: {e}")
    return ""


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@router.post("/analyze")
async def analyze_form(body: FormAnalyzeRequest):
    """Extract form fields, map to citizen profile, return mapping + pre-fill values."""
    _validate_public_url(body.url)

    profile = await _get_profile(body.phone)
    form_fields = await _extract_form_fields(body.url)

    if not form_fields:
        return {
            "url": body.url,
            "form_fields": [],
            "field_map": {},
            "fill_values": {},
            "filled_count": 0,
            "missing_fields": list(PROFILE_FIELD_DESCRIPTIONS.keys()),
            "message": "Could not extract form fields. The page may require login or JavaScript rendering.",
        }

    field_map = await _map_fields_with_gemini(form_fields)
    fill_values, missing_profile_keys = _build_fill_values(field_map, profile)

    return {
        "url": body.url,
        "form_fields": form_fields,
        "field_map": field_map,
        "fill_values": fill_values,
        "filled_count": len(fill_values),
        "missing_fields": missing_profile_keys,
        "profile_completeness": round(len([v for v in profile.values() if v]) * 100 / max(len(PROFILE_FIELD_DESCRIPTIONS), 1)),
    }


@router.post("/fill")
async def fill_form(body: FormFillRequest):
    """Fill the form at the given URL using Playwright and return screenshot path."""
    _validate_public_url(body.url)
    if not body.confirm:
        raise HTTPException(status_code=400, detail="Set confirm=true to proceed with form fill")

    profile = await _get_profile(body.phone)

    # If field_map provided, use it directly; otherwise re-analyze
    field_map = body.field_map
    if not field_map:
        form_fields = await _extract_form_fields(body.url)
        field_map = await _map_fields_with_gemini(form_fields)
    else:
        form_fields = [{"name": k, "id": k} for k in field_map.keys()]

    fill_values, missing_keys = _build_fill_values(field_map, profile)

    fill_result = await _playwright_fill(body.url, fill_values, form_fields)
    screenshot_path = fill_result["screenshot_path"]
    actually_filled = fill_result["actually_filled"]

    session_id = await _save_session(
        phone=body.phone,
        url=body.url,
        field_map=field_map,
        filled_count=actually_filled,
        missing_fields=missing_keys,
        screenshot_path=screenshot_path,
        status="filled" if actually_filled > 0 else "failed",
    )

    return {
        "session_id": session_id,
        "url": body.url,
        "filled_count": actually_filled,
        "missing_fields": missing_keys,
        "screenshot_path": screenshot_path,
        "status": "filled" if actually_filled > 0 else "failed",
    }


@router.get("/screenshot/{filename}")
async def get_screenshot(filename: str):
    """Serve a saved form screenshot by filename."""
    if "/" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    fpath = os.path.join(SCREENSHOT_DIR, filename)
    if not os.path.isfile(fpath):
        raise HTTPException(status_code=404, detail="Screenshot not found")
    return FileResponse(fpath, media_type="image/png")


@router.get("/history/{phone}")
async def fill_history(phone: str, limit: int = 10):
    """Return recent form fill sessions for a phone number."""
    try:
        resp = (
            supabase.table("form_fill_sessions")
            .select("id, url, filled_count, missing_fields, status, created_at")
            .eq("phone", phone)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return {"phone": phone, "sessions": resp.data or []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
