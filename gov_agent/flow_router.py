import re
import uuid
import logging
from urllib.parse import quote
from typing import Any
import google.generativeai as genai
from gov_agent.models import WhatsAppIncoming
from gov_agent.db import supabase
from gov_agent import rag_engine
from gov_agent import graph
from gov_agent import renewal_intelligence
from gov_agent.config import FRONTEND_URL
from gov_agent.config import GEMINI_API_KEY
from gov_agent.document_vault import (
    create_signed_document_url,
    format_sensitive_document_reply,
    get_latest_user_document,
    hash_passkey,
    ingest_document,
    log_document_access,
    verify_passkey,
)

logger = logging.getLogger(__name__)

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

_LANG_NAMES = {
    "hi": "Hindi",
    "kn": "Kannada",
    "ta": "Tamil",
    "te": "Telugu",
    "mr": "Marathi",
}


async def translate_reply(text: str, lang: str) -> str:
    if lang == "en" or lang not in _LANG_NAMES:
        return text
    if not GEMINI_API_KEY:
        return text
    try:
        model = genai.GenerativeModel("gemini-2.0-flash")
        prompt = (
            f"Translate this government service message to {_LANG_NAMES[lang]}, "
            f"keeping numbers, codes and URLs in original:\n{text}"
        )
        resp = model.generate_content(prompt)
        return resp.text.strip()
    except Exception:
        return text

async def _load_profile(phone: str) -> dict:
    """Load citizen profile for a phone number, returns empty dict if not found."""
    try:
        resp = supabase.table("citizen_profiles").select("*").eq("phone", phone).limit(1).execute()
        return resp.data[0] if resp.data else {}
    except Exception:
        return {}


async def _save_profile_field(phone: str, field: str, value) -> None:
    """Upsert a single field into citizen_profiles."""
    try:
        supabase.table("citizen_profiles").upsert(
            {"phone": phone, field: value},
            on_conflict="phone",
        ).execute()
    except Exception as e:
        logger.warning(f"profile save error ({field}): {e}")


async def _emit_activity(phone: str, event: str) -> None:
    try:
        from datetime import datetime, timezone
        supabase.table("activity_feed").insert({
            "phone": phone,
            "event": event,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception:
        pass


MENU = (
    "🙏 Namaste! GovBot - Govt Services\n\n"
    "1️⃣ Apply for Scholarship\n"
    "2️⃣ Check Application Status\n"
    "3️⃣ Check My Eligibility\n"
    "4️⃣ PM Kisan Status\n"
    "5️⃣ Auto-Fill Any Form\n\n"
    "💡 *Other commands:*\n"
    "• 'profile' — View/update profile\n"
    "• 'set pin' — Set security passkey\n"
    "• 'my pan' / 'my aadhaar' — View docs (passkey needed)\n"
    "• 'upload pan' / 'upload aadhaar' — Save KYC docs\n"
    "• 'web' — Open web dashboard\n\n"
    "Reply with 1-5 or a command above"
)

PORTAL_MENU = (
    "📚 Which scholarship would you like to apply for?\n\n"
    "1️⃣ NSP (National Scholarship Portal)\n"
    "2️⃣ PMSS (Post Matric Scholarship)\n"
    "3️⃣ CSSS (Central Sector Scholarship)\n"
    "4️⃣ Minority Scholarship\n\n"
    "Reply with 1, 2, 3 or 4"
)

_DOCUMENT_UPLOAD_COMMANDS = {
    "upload pan": "pan",
    "upload aadhaar": "aadhaar",
    "upload aadhar": "aadhaar",
    "upload adhaar": "aadhaar",
    "upload income cert": "income_cert",
    "upload income certificate": "income_cert",
    "upload caste cert": "caste_cert",
    "upload caste certificate": "caste_cert",
    "upload marksheet": "marksheet",
}

_DOCUMENT_UPLOAD_LABELS = {
    "pan": "PAN card",
    "aadhaar": "Aadhaar card",
    "income_cert": "income certificate",
    "caste_cert": "caste certificate",
    "marksheet": "marksheet",
}

_UPLOAD_COMMAND_HELP = (
    "❌ Command unavailable.\n\n"
    "Try one of these:\n"
    "• upload pan\n"
    "• upload aadhaar\n"
    "• upload income certificate\n"
    "• upload caste certificate\n"
    "• upload marksheet"
)

_RENEWAL_PORTAL_KEYWORDS = {
    "nsp": "nsp",
    "pmss": "pmss",
    "csss": "csss",
    "minority": "minority",
}


def _is_renewal_question(body_lower: str) -> bool:
    return any(
        phrase in body_lower
        for phrase in (
            "when is this expiring",
            "when is it expiring",
            "when should i renew",
            "when do i renew",
            "expiry",
            "expire",
            "renewal",
            "renew",
        )
    )


def _extract_portal_keyword(body_lower: str) -> str | None:
    for keyword, portal in _RENEWAL_PORTAL_KEYWORDS.items():
        if keyword in body_lower:
            return portal
    return None


def _format_upload_result(doc_type: str, result: dict[str, Any]) -> str:
    extracted = result.get("extracted_data") or {}
    label = _DOCUMENT_UPLOAD_LABELS.get(doc_type, doc_type.replace("_", " "))
    lines = [f"✅ Your {label} has been saved.", f"Status: {result.get('status', 'ready')}", ""]

    visible_fields = {
        "pan": ["pan_number", "full_name", "father_name", "dob"],
        "aadhaar": ["aadhaar_number", "full_name", "dob", "gender", "address"],
        "income_cert": ["certificate_number", "annual_income", "issue_date", "valid_until"],
        "caste_cert": ["certificate_number", "caste", "category", "issue_date"],
        "marksheet": ["student_name", "roll_number", "year", "percentage", "issue_date"],
    }.get(doc_type, [])

    pretty_names = {
        "pan_number": "PAN Number",
        "full_name": "Full Name",
        "father_name": "Father Name",
        "dob": "DOB",
        "aadhaar_number": "Aadhaar Number",
        "gender": "Gender",
        "address": "Address",
        "certificate_number": "Certificate Number",
        "annual_income": "Annual Income",
        "issue_date": "Issue Date",
        "valid_until": "Valid Until",
        "caste": "Caste",
        "category": "Category",
        "student_name": "Student Name",
        "roll_number": "Roll Number",
        "year": "Year",
        "percentage": "Percentage",
    }

    for key in visible_fields:
        value = extracted.get(key)
        if value in (None, "", []):
            continue
        lines.append(f"{pretty_names.get(key, key.replace('_', ' ').title())}: {value}")

    status_message = str(result.get("status_reason") or "").strip()
    validation = result.get("validation") or {}
    if not status_message:
        status_message = str(validation.get("message") or "").strip()
    if status_message:
        lines.extend(["", status_message])

    lines.extend(["", "Type 'Hi' for menu or upload another document command."])
    return "\n".join(lines)


async def _run_bank_verification(phone: str, data: dict[str, Any]) -> tuple[str, str, dict]:
    from gov_agent.npci_agent import send_verification_request, notify_verification_status

    try:
        result = await send_verification_request(
            phone,
            data.get("bank_account", ""),
            data.get("bank_ifsc", ""),
        )

        if result.get("success"):
            await notify_verification_status(
                phone,
                "success",
                result.get("beneficiary_name"),
            )
            return await _submit_application(phone, data, data.get("portal", "nsp"))

        await notify_verification_status(phone, "failed")
        return (
            f"⚠️ *Verification Failed*\n\n"
            f"{result.get('message', 'Please check your details and try again')}\n\n"
            f"Reply RETRY to try again or CONTINUE to skip verification",
            "bank_verify_failed",
            data,
        )
    except Exception as e:
        logger.error(f"Bank verification error: {e}")
        return (
            "⚠️ Could not verify bank account.\n\n"
            "Reply RETRY to try again or CONTINUE to proceed",
            "bank_verify_failed",
            data,
        )


def _format_submission_success_reply(phone: str, confirmation_number: str) -> str:
    from gov_agent.qr_login import get_login_url

    track_url = f"{FRONTEND_URL}/track/{quote(str(confirmation_number), safe='')}"
    dashboard_url = get_login_url(phone, "/dashboard")
    return (
        f"🎉 Application Submitted!\n\n"
        f"Confirmation: {confirmation_number}\n\n"
        f"Track status:\n"
        f"{track_url}\n\n"
        f"View all your applications:\n"
        f"{dashboard_url}"
    )


async def route(session: dict, msg: WhatsAppIncoming) -> tuple[str, str, dict]:
    body = msg.body or ""
    data = session.get("collected_data", {})
    state = session.get("state", "greeting")

    _RESTART_KEYWORDS = {"restart", "reset", "start over", "/start"}
    _EXIT_KEYWORDS = {"exit", "close", "cancel"}
    body_lower = body.strip().lower()

    # ── Global keyword: set passkey ────────────────────────────────────────
    if body_lower in {"set pin", "set passkey", "change pin", "change passkey"}:
        return ("🔐 Enter a 4-digit security PIN:", "set_passkey", data)

    if body_lower in _DOCUMENT_UPLOAD_COMMANDS:
        doc_type = _DOCUMENT_UPLOAD_COMMANDS[body_lower]
        label = _DOCUMENT_UPLOAD_LABELS[doc_type]
        return (
            f"📎 Please send your {label} as a clear photo or document file.",
            "kyc_document_upload",
            {**data, "_pending_doc_type": doc_type},
        )

    if body_lower.startswith("upload "):
        return (_UPLOAD_COMMAND_HELP, "greeting", data)

    # ── Global keyword: open web dashboard ─────────────────────────────────
    if body_lower in {"web", "open web", "dashboard", "open dashboard", "website"}:
        from gov_agent.qr_login import get_login_url
        login_url = get_login_url(msg.phone)
        await _emit_activity(msg.phone, "🌐 Web dashboard link generated")
        return (
            f"🌐 *Open GovBot Web Dashboard*\n\n"
            f"Click to open (auto-login):\n{login_url}\n\n"
            f"📱 Share this link to access from another device.\n"
            f"Link expires in 2 hours.",
            "greeting",
            data,
        )

    # ── Sensitive data query: "whats my pan", "my aadhaar", etc. ──────────
    _SENSITIVE_PATTERNS = {
        "pan": "pan_number",
        "aadhaar": "aadhaar_number",
        "bank": "bank_account",
        "account": "bank_account",
        "ifsc": "bank_ifsc",
    }
    for keyword, field in _SENSITIVE_PATTERNS.items():
        if keyword in body_lower and ("my" in body_lower or "what" in body_lower or "show" in body_lower):
            profile = await _load_profile(msg.phone)
            if not profile.get("passkey_hash"):
                next_data = {**data, "_after_passkey": "reveal"}
                if keyword in {"pan", "aadhaar"}:
                    next_data["_reveal_doc_type"] = keyword
                else:
                    next_data["_reveal_field"] = field
                return (
                    "🔐 First, set a 4-digit security passkey to protect your data:",
                    "set_passkey",
                    next_data,
                )
            if keyword in {"pan", "aadhaar"}:
                data["_reveal_doc_type"] = keyword
            else:
                data["_reveal_field"] = field
            return ("🔐 Enter your 4-digit passkey:", "passkey_verify", data)

    # ── Global keyword: update profile ──────────────────────────────────────
    if body_lower in {"update profile", "profile", "my profile", "/profile"}:
        profile = await _load_profile(msg.phone)
        from gov_agent.profile_router import _compute_completeness
        pct, missing = _compute_completeness(profile)
        missing_list = ", ".join(missing[:5]) if missing else "none"
        return (
            f"👤 *Your Profile* ({pct}% complete)\n\n"
            f"Name: {profile.get('full_name', '—')}\n"
            f"DOB: {profile.get('dob', '—')}\n"
            f"Income: ₹{profile.get('income', '—')}\n"
            f"Caste: {profile.get('caste', '—')}\n"
            f"Bank: {'✅ added' if profile.get('bank_account') else '❌ missing'}\n\n"
            f"Missing: {missing_list}\n\n"
            f"🌐 Complete your profile: {FRONTEND_URL}/profile\n"
            f"Reply *UPDATE NAME*, *UPDATE INCOME*, etc. to change a field.",
            "profile_view",
            data,
        )

    # ── Global keyword: fill form ────────────────────────────────────────────
    if body_lower in {"fill form", "autofill", "auto fill", "/fill"}:
        return (
            "🤖 *Smart Form Fill*\n\n"
            "Paste the URL of any government form and I'll fill it from your profile.\n\n"
            "Example: https://scholarships.gov.in/fresh/newstdRegfrmInstruction\n\n"
            f"🌐 Or use the web tool: {FRONTEND_URL}/form-fill",
            "form_fill_url",
            data,
        )

    if _is_renewal_question(body_lower):
        return (
            renewal_intelligence.build_whatsapp_summary(
                msg.phone,
                portal=_extract_portal_keyword(body_lower),
            ),
            "greeting",
            data,
        )

    if body_lower in _RESTART_KEYWORDS:
        return (MENU, "greeting", {})

    if body_lower in _EXIT_KEYWORDS:
        farewell = (
            "👋 Thank you for using GovBot!\n\n"
            "Your session has been closed.\n\n"
            "Type 'Hi' anytime to start again 🙏"
        )
        return (farewell, "__delete__", {})

    if state == "greeting":
        if body == "1":
            return (PORTAL_MENU, "portal_select", data)
        elif body == "2":
            return ("Enter your confirmation number:", "check_status", data)
        elif body == "3":
            return (
                "Annual family income in ₹? (enter a number, e.g. 180000)",
                "eligibility_screen_income",
                data)
        elif body == "4":
            return ("Enter your 12-digit Aadhaar or 11-digit PM Kisan Registration Number:",
                    "pm_kisan_aadhaar", data)
        elif body == "5":
            return (
                "🤖 *Smart Form Fill*\n\n"
                "Paste the URL of any government form and I'll fill it from your profile.\n\n"
                f"🌐 Or use the web tool: {FRONTEND_URL}/form-fill",
                "form_fill_url",
                data,
            )
        else:
            profile = await _load_profile(msg.phone)
            if profile.get("full_name"):
                from gov_agent.profile_router import _compute_completeness
                pct, _ = _compute_completeness(profile)
                greeting_menu = (
                    f"🙏 Welcome back, {profile['full_name'].split()[0]}! GovBot\n"
                    f"📊 Profile: {pct}% complete\n\n"
                    "1️⃣ Apply for Scholarship\n"
                    "2️⃣ Check Application Status\n"
                    "3️⃣ Check My Eligibility\n"
                    "4️⃣ PM Kisan Status\n"
                    "5️⃣ Auto-Fill Any Form\n\n"
                    "Reply with 1-5 or type 'profile' to manage your profile"
                )
                return (greeting_menu, "greeting", data)
            return (MENU, "greeting", data)

    elif state == "portal_select":
        if body == "1":
            data["portal"] = "nsp"
            return (
                "🔗 *Connect DigiLocker?*\n\n"
                "Link your DigiLocker to auto-fetch:\n"
                "• Aadhaar Card\n"
                "• Income Certificate\n"
                "• Caste Certificate\n\n"
                "Reply *YES* to connect or *NO* to enter manually",
                "digilocker_offer",
                data
            )
        elif body == "2":
            data["portal"] = "pmss"
            return (
                "🔗 *Connect DigiLocker?*\n\n"
                "Link your DigiLocker to auto-fetch your documents.\n\n"
                "Reply *YES* to connect or *NO* to enter manually",
                "digilocker_offer",
                data
            )
        elif body == "3":
            data["portal"] = "csss"
            return (
                "🔗 *Connect DigiLocker?*\n\n"
                "Link your DigiLocker to auto-fetch your documents.\n\n"
                "Reply *YES* to connect or *NO* to enter manually",
                "digilocker_offer",
                data
            )
        elif body == "4":
            data["portal"] = "minority"
            return (
                "🔗 *Connect DigiLocker?*\n\n"
                "Link your DigiLocker to auto-fetch your documents.\n\n"
                "Reply *YES* to connect or *NO* to enter manually",
                "digilocker_offer",
                data
            )
        else:
            return (PORTAL_MENU, "portal_select", data)

    elif state == "digilocker_offer":
        if body.lower() in ["yes", "y", "haan", "ಹೌದು"]:
            # Create mock consent and send link
            from gov_agent.digilocker_router import create_mock_consent, CreateConsentRequest
            try:
                consent = await create_mock_consent(CreateConsentRequest(phone=msg.phone))
                data["consent_id"] = consent.consent_id
                return (
                    f"⏳ *Connecting DigiLocker...*\n\n"
                    f"🔗 Click to authorize:\n{consent.redirect_url}\n\n"
                    f"⏱️ Link expires in 30 minutes\n\n"
                    f"Reply *CHECK* when done or *SKIP* to enter manually",
                    "digilocker_awaiting_auth",
                    data
                )
            except Exception:
                # Fallback to manual entry
                return ("What is your full name as per Aadhaar?", "collect_name", data)
        else:
            # Skip DigiLocker, go to manual entry
            portal = data.get("portal", "nsp")
            next_states = {
                "nsp": "collect_name",
                "pmss": "pmss_collect_name",
                "csss": "csss_collect_name",
                "minority": "minority_collect_name",
            }
            return ("What is your full name as per Aadhaar?", next_states.get(portal, "collect_name"), data)

    elif state == "digilocker_awaiting_auth":
        if body.lower() in ["check", "status"]:
            # Check if DigiLocker is connected
            from gov_agent.digilocker_agent import is_digilocker_connected, format_digilocker_summary, prefill_application_data
            
            if is_digilocker_connected(msg.phone):
                # Get pre-filled data
                prefill = prefill_application_data(msg.phone)
                data.update(prefill)
                
                summary = format_digilocker_summary(msg.phone)
                
                portal = data.get("portal", "nsp")
                next_states = {
                    "nsp": "collect_name",
                    "pmss": "pmss_collect_name",
                    "csss": "csss_collect_name",
                    "minority": "minority_collect_name",
                }
                
                return (
                    f"{summary}\n\n"
                    f"✅ Continuing with pre-filled data...",
                    next_states.get(portal, "collect_name"),
                    data
                )
            else:
                return (
                    "⏳ Still waiting for DigiLocker authorization...\n\n"
                    "Please click the link above and authorize access.\n\n"
                    "Reply CHECK to try again or SKIP to enter manually",
                    "digilocker_awaiting_auth",
                    data
                )
        elif body.lower() in ["skip", "no", "n", "ಬೇಡ"]:
            # Skip to manual entry
            portal = data.get("portal", "nsp")
            next_states = {
                "nsp": "collect_name",
                "pmss": "pmss_collect_name",
                "csss": "csss_collect_name",
                "minority": "minority_collect_name",
            }
            return ("What is your full name as per Aadhaar?", next_states.get(portal, "collect_name"), data)
        else:
            return (
                "⏳ Waiting for DigiLocker authorization...\n\n"
                "Reply CHECK to check status or SKIP to enter manually",
                "digilocker_awaiting_auth",
                data
            )

    elif state == "profile_view":
        body_up = body.strip().upper()
        if body_up.startswith("UPDATE "):
            field_keyword = body_up[7:].strip()
            field_map = {
                "NAME": ("full_name", "What is your full name?", "profile_update_name"),
                "DOB": ("dob", "Date of birth? (DD/MM/YYYY)", "profile_update_dob"),
                "INCOME": ("income", "Annual family income in ₹?", "profile_update_income"),
                "CASTE": ("caste", "Caste category? (general/obc/sc/st/ews)", "profile_update_caste"),
                "BANK": ("bank_account", "Enter your bank account number:", "profile_update_bank"),
                "IFSC": ("bank_ifsc", "Enter your 11-character IFSC code:", "profile_update_ifsc"),
                "EMAIL": ("email", "Enter your email address:", "profile_update_email"),
                "ADDRESS": ("address", "Enter your full address:", "profile_update_address"),
            }
            if field_keyword in field_map:
                _, question, next_state = field_map[field_keyword]
                data["_update_field"] = field_map[field_keyword][0]
                return (question, next_state, data)
        return (MENU, "greeting", data)

    elif state in (
        "profile_update_name", "profile_update_dob", "profile_update_income",
        "profile_update_caste", "profile_update_bank", "profile_update_ifsc",
        "profile_update_email", "profile_update_address",
    ):
        field = data.get("_update_field", "full_name")
        value: Any = body.strip()
        if field == "income":
            if not value.isdigit():
                return ("❌ Enter numbers only", state, data)
            value = int(value)
        elif field == "dob":
            if not re.match(r"^\d{2}/\d{2}/\d{4}$", value):
                return ("❌ Use DD/MM/YYYY format", state, data)
        await _save_profile_field(msg.phone, field, value)
        data.pop("_update_field", None)
        return (
            f"✅ {field.replace('_', ' ').title()} updated!\n\n"
            "Reply 'profile' to view your profile or 'Hi' for main menu.",
            "profile_view",
            data,
        )

    # ── Passkey: Set passkey ──────────────────────────────────────────────
    elif state == "set_passkey":
        pin = body.strip()
        if not pin.isdigit() or len(pin) != 4:
            return ("❌ Enter a 4-digit PIN only.", "set_passkey", data)
        await _save_profile_field(msg.phone, "passkey_hash", hash_passkey(pin))
        await _emit_activity(msg.phone, "🔐 Security passkey set")
        if data.get("_after_passkey") == "reveal":
            data.pop("_after_passkey", None)
            return ("✅ Passkey set! Now enter it to view your data:", "passkey_verify", data)
        return (
            "✅ Passkey set! You'll need this to view sensitive data.\n\n" + MENU,
            "greeting",
            data,
        )

    # ── Passkey: Verify before revealing data ─────────────────────────────
    elif state == "passkey_verify":
        pin = body.strip()
        profile = await _load_profile(msg.phone)
        stored_digest = profile.get("passkey_hash", "")
        legacy_pin = profile.get("passkey", "")
        verified = verify_passkey(pin, stored_digest) or (legacy_pin and pin == legacy_pin)
        if not verified:
            return ("❌ Wrong passkey. Try again:", "passkey_verify", data)
        doc_type = data.get("_reveal_doc_type")
        if doc_type:
            document = get_latest_user_document(msg.phone, doc_type)
            data.pop("_reveal_doc_type", None)
            if not document:
                return (
                    f"❌ No {doc_type.replace('_', ' ')} found yet. Send 'upload {doc_type}' first.",
                    "greeting",
                    data,
                )
            signed_url = None
            try:
                signed_url = create_signed_document_url(document["storage_path"])
            except Exception as exc:
                logger.warning("Signed URL creation failed for %s/%s: %s", msg.phone, doc_type, exc)
            try:
                log_document_access(
                    phone=msg.phone,
                    document_id=document.get("id"),
                    action="reveal",
                    metadata={"doc_type": doc_type, "channel": "whatsapp"},
                )
            except Exception as exc:
                logger.warning("Document access log failed for reveal %s/%s: %s", msg.phone, doc_type, exc)
            await _emit_activity(msg.phone, f"🔓 Sensitive document accessed: {doc_type}")
            return (
                format_sensitive_document_reply(doc_type, document, signed_url=signed_url),
                "greeting",
                data,
            )
        field = data.get("_reveal_field", "")
        value = profile.get(field, "Not available")
        await _emit_activity(msg.phone, f"🔓 Sensitive data accessed: {field}")
        data.pop("_reveal_field", None)
        return (
            f"🔓 Your {field.replace('_', ' ').title()}: *{value}*\n\n"
            "This message will not be stored. Type 'Hi' for menu.",
            "greeting",
            data,
        )

    elif state == "kyc_document_upload":
        doc_type = data.get("_pending_doc_type")
        if not doc_type:
            return (MENU, "greeting", data)
        if msg.message_type not in {"image", "document"} or not msg.media_id:
            return (
                f"📎 Please send your {_DOCUMENT_UPLOAD_LABELS.get(doc_type, doc_type)} as an image or document file.",
                "kyc_document_upload",
                data,
            )
        try:
            result = await ingest_document(
                phone=msg.phone,
                doc_type=doc_type,
                source="whatsapp",
                media_id=msg.media_id,
                file_name=msg.file_name,
                mime_type=msg.mime_type,
            )
            await _emit_activity(msg.phone, f"📄 {doc_type} uploaded to vault")
            data.pop("_pending_doc_type", None)
            return (_format_upload_result(doc_type, result), "greeting", data)
        except Exception as exc:
            logger.error("WhatsApp document upload failed for %s/%s: %s", msg.phone, doc_type, exc)
            return (
                f"❌ Could not save your {_DOCUMENT_UPLOAD_LABELS.get(doc_type, doc_type)}. Please try a clearer file.",
                "kyc_document_upload",
                data,
            )

    elif state == "form_fill_url":
        url = body.strip()
        if not url.startswith("http"):
            return ("❌ Please send a valid URL starting with http:// or https://", "form_fill_url", data)
        profile = await _load_profile(msg.phone)
        if not profile.get("full_name"):
            return (
                "⚠️ Your profile is empty. Complete it first:\n"
                f"{FRONTEND_URL}/profile\n\n"
                "Or reply 'update profile' to add your details via chat.",
                "greeting",
                data,
            )
        return (
            f"🔍 Analyzing form fields at:\n{url}\n\n"
            f"⏳ Opening form with Playwright + Gemini mapper...\n\n"
            f"🌐 For live status: {FRONTEND_URL}/form-fill\n\n"
            f"This may take 30-60 seconds. I'll message you when done.",
            "form_fill_processing",
            {**data, "_fill_url": url},
        )

    elif state == "form_fill_processing":
        url = data.get("_fill_url", "")
        if not url:
            return (MENU, "greeting", data)
        try:
            from gov_agent.form_scanner_router import analyze_form, fill_form, FormAnalyzeRequest, FormFillRequest
            analyze_result = await analyze_form(FormAnalyzeRequest(url=url, phone=msg.phone))
            field_map = analyze_result.get("field_map", {})
            missing = analyze_result.get("missing_fields", [])
            filled_count = analyze_result.get("filled_count", 0)
            missing_str = ", ".join(missing[:3]) if missing else "none"
            reply = (
                f"✅ Form analyzed! Found {len(field_map)} fields.\n"
                f"Auto-filled from profile: {filled_count}\n"
                f"Missing: {missing_str}\n\n"
            )
            if missing:
                data["_fill_url"] = url
                data["_fill_map"] = field_map
                data["_fill_missing"] = missing
                reply += f"Please provide: *{missing[0].replace('_', ' ')}*"
                return (reply, "form_fill_collect_gap", data)
            fill_result = await fill_form(FormFillRequest(url=url, phone=msg.phone, field_map=field_map, confirm=True))
            await _emit_activity(msg.phone, f"🤖 Form auto-filled: {fill_result.get('filled_count', filled_count)} fields")
            return (
                reply +
                f"🎉 Form filled! {fill_result.get('filled_count', filled_count)} fields completed.\n\n"
                f"📸 Screenshot: {FRONTEND_URL}/form-fill\n"
                f"Type 'restart' for main menu.",
                "completed",
                data,
            )
        except Exception as e:
            logger.error(f"form_fill_processing error: {e}")
            return (
                f"❌ Could not process form: {str(e)[:100]}\n"
                f"Try: {FRONTEND_URL}/form-fill for the web tool.",
                "greeting",
                data,
            )

    elif state == "form_fill_collect_gap":
        missing_fields: list = data.get("_fill_missing", [])
        if not missing_fields:
            return (MENU, "greeting", data)
        current_field = missing_fields[0]
        data["_fill_map"] = {**data.get("_fill_map", {}), current_field: body.strip()}
        await _save_profile_field(msg.phone, current_field, body.strip())
        remaining = missing_fields[1:]
        data["_fill_missing"] = remaining
        if remaining:
            return (f"Please provide: *{remaining[0].replace('_', ' ')}*", "form_fill_collect_gap", data)
        url = data.get("_fill_url", "")
        field_map = data.get("_fill_map", {})
        try:
            from gov_agent.form_scanner_router import fill_form, FormFillRequest
            fill_result = await fill_form(FormFillRequest(url=url, phone=msg.phone, field_map=field_map, confirm=True))
            return (
                f"🎉 Form filled! {fill_result.get('filled_count', len(field_map))} fields completed.\n\n"
                f"📸 Screenshot: {FRONTEND_URL}/form-fill\n"
                "Type 'restart' for main menu.",
                "completed",
                data,
            )
        except Exception as e:
            return (f"❌ Fill error: {str(e)[:100]}", "greeting", data)

    elif state == "collect_name":
        data["name"] = body.strip()
        await _save_profile_field(msg.phone, "full_name", data["name"])
        await _emit_activity(msg.phone, "📝 Profile collection started")
        session_id = str(uuid.uuid4())
        data["session_id"] = session_id
        try:
            from gov_agent.live_router import create_live_session
            await create_live_session(session_id, msg.phone)
        except Exception:
            pass
        await _advance(session_id, 1, {"name": data["name"]})
        return ("Date of birth? (DD/MM/YYYY)", "collect_dob", data)

    elif state == "collect_dob":
        if not re.match(r"^\d{2}/\d{2}/\d{4}$", body.strip()):
            return ("❌ Invalid format. Use DD/MM/YYYY", "collect_dob", data)
        data["dob"] = body.strip()
        await _save_profile_field(msg.phone, "dob", data["dob"])
        await _advance(data.get("session_id"), 2, {"name": data.get("name"), "dob": data["dob"]})
        return ("Annual family income in ₹?", "collect_income", data)

    elif state == "collect_income":
        if not body.strip().isdigit():
            return ("❌ Enter numbers only", "collect_income", data)
        data["income"] = int(body.strip())
        await _save_profile_field(msg.phone, "income", data["income"])
        await _emit_activity(msg.phone, f"💰 Income recorded: ₹{data['income']}")
        await _advance(data.get("session_id"), 3, {"name": data.get("name"), "dob": data.get("dob"), "income": data["income"]})
        return (
            "Please send a clear photo of your Aadhaar card 📎",
            "awaiting_document",
            data)

    elif state == "collect_aadhaar":
        aadhaar = body.strip().replace(" ", "")
        if not aadhaar.isdigit() or len(aadhaar) != 12:
            return ("❌ Invalid Aadhaar. Enter 12 digits only.", "collect_aadhaar", data)
        data["aadhaar_number"] = aadhaar
        return ("Please send a clear photo of your Aadhaar card 📎", "awaiting_document", data)

    elif state == "awaiting_document":
        if msg.message_type == "image" and msg.media_id:
            data["media_id"] = msg.media_id
            # Run OCR on received Aadhaar image
            try:
                from gov_agent.ocr_router import extract_ocr
                from gov_agent.ocr_router import OcrRequest
                ocr_result = await extract_ocr(OcrRequest(
                    media_id=msg.media_id,
                    session_id=data.get("session_id"),
                    phone=msg.phone,
                ))
                if ocr_result.get("name") and not ocr_result.get("error"):
                    data["ocr"] = ocr_result
                    data["_pending_ocr_confirm"] = True
                    ocr_name = ocr_result["name"]
                    ocr_dob = ocr_result.get("dob", "N/A")
                    await _emit_activity(msg.phone, "📄 Document scanned via OCR")
                    return (
                        f"✅ Processing your Aadhaar...\nExtracted:\nName: {ocr_name}\nDOB: {ocr_dob}\n\nIs this correct? Reply YES or NO",
                        "ocr_confirm",
                        data,
                    )
            except Exception:
                pass
            # Send acknowledgement immediately
            from gov_agent import whatsapp_sender
            import asyncio
            await whatsapp_sender.send_message(
                msg.phone,
                "✅ Document received!\nSubmitting your application...\nThis may take 30-60 seconds."
            )
            
            # Run submission
            try:
                # Check for portal-specific submission
                portal = data.get("portal", "nsp")
                if portal == "pmss":
                    from gov_agent import pmss_agent
                    result = await pmss_agent.run_pmss_application(data)
                elif portal == "csss":
                    from gov_agent import csss_agent
                    result = await csss_agent.run_csss_application(data)
                elif portal == "minority":
                    from gov_agent import minority_agent
                    result = await minority_agent.run_minority_application(data)
                else:
                    result = await graph.run_application(data)
                conf = result.get("submission_result", {}).get("confirmation_number")
                if conf:
                    await _emit_activity(msg.phone, f"🎉 Application submitted! Confirmation: {conf}")
                    return (_format_submission_success_reply(msg.phone, conf), "completed", data)

                error = result.get("error", "Unknown error")
                return (f"❌ Failed: {error}\nType restart", "completed", data)
            except Exception as e:
                return (f"❌ Error: {str(e)}\nType restart", "completed", data)

        return ("Please send Aadhaar as image 📎", "awaiting_document", data)

    elif state == "ocr_confirm":
        if body.strip().upper() == "YES":
            ocr = data.get("ocr", {})
            if ocr.get("name"):
                data["name"] = ocr["name"]
            if ocr.get("dob"):
                data["dob"] = ocr["dob"]
            data.pop("_pending_ocr_confirm", None)
            
            # Move to bank verification
            return (
                "💳 *Bank Account Verification*\n\n"
                "For scholarship disbursement, we need to verify your bank account.\n\n"
                "Please enter your 11-digit IFSC code (e.g., SBIN0001234)",
                "collect_bank_ifsc",
                data
            )
        else:
            data.pop("ocr", None)
            data.pop("_pending_ocr_confirm", None)
            return ("Please re-upload your Aadhaar card 📎", "awaiting_document", data)

    elif state == "collect_bank_ifsc":
        # Validate IFSC code (11 characters)
        ifsc = body.strip().upper()
        if len(ifsc) != 11:
            return (
                "❌ Invalid IFSC code. Must be 11 characters (e.g., SBIN0001234)\n\n"
                "Please enter your IFSC code:",
                "collect_bank_ifsc",
                data
            )
        data["bank_ifsc"] = ifsc
        return (
            "🔢 Now enter your bank account number:",
            "collect_bank_account",
            data
        )

    elif state == "collect_bank_account":
        account = body.strip().replace(" ", "")
        if not account.isdigit() or len(account) < 9:
            return (
                "❌ Invalid account number. Must be 9-18 digits.\n\n"
                "Please enter your account number:",
                "collect_bank_account",
                data
            )
        data["bank_account"] = account

        return await _run_bank_verification(msg.phone, data)

    elif state == "verify_bank":
        return await _run_bank_verification(msg.phone, data)

    elif state == "bank_verify_failed":
        decision = body.strip().upper()
        if decision == "RETRY":
            return (
                "💳 Please enter your 11-digit IFSC code:",
                "collect_bank_ifsc",
                data
            )
        if decision == "CONTINUE":
            return await _submit_application(msg.phone, data, data.get("portal", "nsp"))
        return (
            "⚠️ Verification is still pending.\n\n"
            "Reply RETRY to enter bank details again or CONTINUE to submit without verification.",
            "bank_verify_failed",
            data,
        )

    elif state == "verify_and_submit":
        return await _submit_application(msg.phone, data, data.get("portal", "nsp"))


    elif state == "check_status":
        confirmation_number = body.strip()
        response = supabase.table("applications").select(
            "*").eq("confirmation_number", confirmation_number).limit(1).execute()
        if response.data:
            row: dict = response.data[0]  # type: ignore
            track_url = f"{FRONTEND_URL}/track/{quote(confirmation_number, safe='')}"
            return (
                f"📋 Application {confirmation_number}\n"
                f"Status: {str(row.get('status', '')).upper()}\n"
                f"Service: {row.get('service', '')}\n"
                f"Track status:\n{track_url}",
                "greeting",
                data
            )
        else:
            return (
                "❌ No application found with that number.\n"
                "Type 'restart' to retry",
                "greeting",
                data
            )

    elif state == "eligibility_screen_income":
        if not body.strip().isdigit():
            return ("❌ Enter numbers only, e.g. 180000", "eligibility_screen_income", data)
        data["elig_income"] = int(body.strip())
        return (
            "Category? Reply:\nSC / ST / OBC / General",
            "eligibility_screen_caste",
            data,
        )

    elif state == "eligibility_screen_caste":
        val = body.strip().upper()
        if val not in ("SC", "ST", "OBC", "GENERAL"):
            return ("❌ Reply SC, ST, OBC or General", "eligibility_screen_caste", data)
        data["elig_caste"] = val.capitalize() if val == "GENERAL" else val
        return (
            "Course level?\n1️⃣ Pre Matric\n2️⃣ Post Matric\n3️⃣ Degree",
            "eligibility_screen_course",
            data,
        )

    elif state == "eligibility_screen_course":
        mapping = {"1": "pre_matric", "2": "post_matric", "3": "degree"}
        if body.strip() not in mapping:
            return ("❌ Reply 1, 2 or 3", "eligibility_screen_course", data)
        data["elig_course"] = mapping[body.strip()]
        return ("Marks % in last exam? (e.g. 75.5)", "eligibility_screen_marks", data)

    elif state == "eligibility_screen_marks":
        try:
            marks = float(body.strip())
        except ValueError:
            return ("❌ Enter a number, e.g. 75.5", "eligibility_screen_marks", data)
        data["elig_marks"] = marks
        try:
            from gov_agent.models import EligibilityRequest
            from gov_agent import eligibility_router as _er
            req = EligibilityRequest(
                income=data["elig_income"],
                caste=data["elig_caste"],
                course_level=data["elig_course"],
                marks_pct=marks,
            )
            result = await _er.screen_eligibility(req)
            data["elig_result"] = {"eligible": result.eligible, "schemes": result.schemes}
            if result.eligible:
                scheme_list = "\n".join(f"  ✅ {s}" for s in result.schemes)
                reply = (
                    f"🎉 You are ELIGIBLE for:\n{scheme_list}\n\n"
                    f"Reply 1 to apply now, or type restart."
                )
            else:
                reason_list = "\n".join(f"  ❌ {r}" for r in result.reasons[:4])
                reply = f"😔 Not eligible at this time:\n{reason_list}\n\nType restart for main menu."
        except Exception as e:
            reply = f"❌ Could not check eligibility: {e}\nType restart."
        return (reply, "eligibility_result", data)

    elif state == "eligibility_result":
        if body.strip() == "1" and data.get("elig_result", {}).get("eligible"):
            return (
                "What is your full name as per Aadhaar?",
                "collect_name",
                data,
            )
        return (MENU, "greeting", data)

    elif state == "eligibility_query":
        answer = await rag_engine.query_eligibility(body)
        return (answer, "greeting", data)

    elif state == "pm_kisan_aadhaar":
        identifier = body.strip().replace(" ", "")
        if not identifier.isdigit() or len(identifier) not in (11, 12):
            return (
                "❌ Please enter a valid:\n"
                "• 12-digit Aadhaar number, or\n"
                "• 11-digit PM Kisan Registration Number",
                "pm_kisan_aadhaar", data)
        try:
            from gov_agent import pm_kisan_agent
            result = await pm_kisan_agent\
                .check_pm_kisan_status(identifier)
            return (
                result.get("message", "Could not fetch info.") + "\n\n"
                "Type 'restart' for main menu.",
                "greeting", data)
        except Exception as e:
            return (
                f"❌ Could not fetch status: {str(e)}\n"
                "Type 'restart' to try again.",
                "greeting", data)

    elif state == "completed":
        if body.strip().lower() == "restart":
            return (MENU, "greeting", {})
        return (
            "Your application is complete ✅\n"
            "Type 'restart' for new application",
            "completed",
            data
        )

    # PMSS flow states
    elif state == "pmss_collect_name":
        data["name"] = body.strip()
        data["portal"] = "pmss"
        await _save_profile_field(msg.phone, "full_name", data["name"])
        return ("Date of birth? (DD/MM/YYYY)", "pmss_collect_dob", data)

    elif state == "pmss_collect_dob":
        if not re.match(r"^\d{2}/\d{2}/\d{4}$", body.strip()):
            return ("❌ Invalid format. Use DD/MM/YYYY", "pmss_collect_dob", data)
        data["dob"] = body.strip()
        return ("Annual family income in ₹?", "pmss_collect_income", data)

    elif state == "pmss_collect_income":
        if not body.strip().isdigit():
            return ("❌ Enter numbers only", "pmss_collect_income", data)
        data["income"] = int(body.strip())
        return ("Caste category? (SC/ST/OBC)", "pmss_collect_caste", data)

    elif state == "pmss_collect_caste":
        data["caste"] = body.strip().upper()
        return ("Name of your institution/college?", "pmss_collect_institution", data)

    elif state == "pmss_collect_institution":
        data["institution"] = body.strip()
        return ("Course name?", "pmss_collect_course", data)

    elif state == "pmss_collect_course":
        data["course"] = body.strip()
        return ("Enter your 12-digit Aadhaar number:", "pmss_collect_aadhaar", data)

    elif state == "pmss_collect_aadhaar":
        aadhaar = body.strip().replace(" ", "")
        if not aadhaar.isdigit() or len(aadhaar) != 12:
            return ("❌ Invalid Aadhaar. Enter 12 digits only.", "pmss_collect_aadhaar", data)
        data["aadhaar_number"] = aadhaar
        return ("Please send a clear photo of your Aadhaar card 📎", "pmss_awaiting_document", data)

    elif state == "pmss_awaiting_document":
        if msg.message_type == "image" and msg.media_id:
            data["media_id"] = msg.media_id
            return await _submit_application(msg.phone, data, "pmss")
        return ("Please send Aadhaar as image 📎", "pmss_awaiting_document", data)

    # CSSS flow states
    elif state == "csss_collect_name":
        data["name"] = body.strip()
        data["portal"] = "csss"
        await _save_profile_field(msg.phone, "full_name", data["name"])
        return ("Date of birth? (DD/MM/YYYY)", "csss_collect_dob", data)

    elif state == "csss_collect_dob":
        if not re.match(r"^\d{2}/\d{2}/\d{4}$", body.strip()):
            return ("❌ Invalid format. Use DD/MM/YYYY", "csss_collect_dob", data)
        data["dob"] = body.strip()
        return ("Annual family income in ₹?", "csss_collect_income", data)

    elif state == "csss_collect_income":
        if not body.strip().isdigit():
            return ("❌ Enter numbers only", "csss_collect_income", data)
        data["income"] = int(body.strip())
        return ("Marks percentage in last exam? (e.g., 85.5)", "csss_collect_marks", data)

    elif state == "csss_collect_marks":
        try:
            data["marks_pct"] = float(body.strip())
        except ValueError:
            return ("❌ Enter valid percentage (e.g., 85.5)", "csss_collect_marks", data)
        return ("Name of your institution/college?", "csss_collect_institution", data)

    elif state == "csss_collect_institution":
        data["institution"] = body.strip()
        return ("Course name?", "csss_collect_course", data)

    elif state == "csss_collect_course":
        data["course"] = body.strip()
        return ("Enter your 12-digit Aadhaar number:", "csss_collect_aadhaar", data)

    elif state == "csss_collect_aadhaar":
        aadhaar = body.strip().replace(" ", "")
        if not aadhaar.isdigit() or len(aadhaar) != 12:
            return ("❌ Invalid Aadhaar. Enter 12 digits only.", "csss_collect_aadhaar", data)
        data["aadhaar_number"] = aadhaar
        return ("Please send a clear photo of your Aadhaar card 📎", "csss_awaiting_document", data)

    elif state == "csss_awaiting_document":
        if msg.message_type == "image" and msg.media_id:
            data["media_id"] = msg.media_id
            return await _submit_application(msg.phone, data, "csss")
        return ("Please send Aadhaar as image 📎", "csss_awaiting_document", data)

    # Minority flow states
    elif state == "minority_collect_name":
        data["name"] = body.strip()
        data["portal"] = "minority"
        await _save_profile_field(msg.phone, "full_name", data["name"])
        return ("Date of birth? (DD/MM/YYYY)", "minority_collect_dob", data)

    elif state == "minority_collect_dob":
        if not re.match(r"^\d{2}/\d{2}/\d{4}$", body.strip()):
            return ("❌ Invalid format. Use DD/MM/YYYY", "minority_collect_dob", data)
        data["dob"] = body.strip()
        return ("Annual family income in ₹?", "minority_collect_income", data)

    elif state == "minority_collect_income":
        if not body.strip().isdigit():
            return ("❌ Enter numbers only", "minority_collect_income", data)
        data["income"] = int(body.strip())
        return ("Your religion? (Muslim/Sikh/Christian/Buddhist/Parsi/Jain)", "minority_collect_religion", data)

    elif state == "minority_collect_religion":
        data["religion"] = body.strip().capitalize()
        return ("Name of your institution/college?", "minority_collect_institution", data)

    elif state == "minority_collect_institution":
        data["institution"] = body.strip()
        return ("Course name?", "minority_collect_course", data)

    elif state == "minority_collect_course":
        data["course"] = body.strip()
        return ("Marks percentage in last exam?", "minority_collect_marks", data)

    elif state == "minority_collect_marks":
        try:
            data["marks_pct"] = float(body.strip())
        except ValueError:
            return ("❌ Enter valid percentage", "minority_collect_marks", data)
        return ("Enter your 12-digit Aadhaar number:", "minority_collect_aadhaar", data)

    elif state == "minority_collect_aadhaar":
        aadhaar = body.strip().replace(" ", "")
        if not aadhaar.isdigit() or len(aadhaar) != 12:
            return ("❌ Invalid Aadhaar. Enter 12 digits only.", "minority_collect_aadhaar", data)
        data["aadhaar_number"] = aadhaar
        return ("Please send a clear photo of your Aadhaar card 📎", "minority_awaiting_document", data)

    elif state == "minority_awaiting_document":
        if msg.message_type == "image" and msg.media_id:
            data["media_id"] = msg.media_id
            return await _submit_application(msg.phone, data, "minority")
        return ("Please send Aadhaar as image 📎", "minority_awaiting_document", data)

    return (MENU, "greeting", data)


async def _submit_application(phone: str, data: dict, portal: str) -> tuple:
    """Helper to submit application and return response."""
    from gov_agent import whatsapp_sender
    from gov_agent import pmss_agent, csss_agent, minority_agent

    data["phone"] = phone
    data["portal"] = portal

    await whatsapp_sender.send_message(
        phone,
        "✅ Document received!\nSubmitting your application...\nThis may take 30-60 seconds."
    )

    try:
        if portal == "pmss":
            result = await pmss_agent.run_pmss_application(data)
        elif portal == "csss":
            result = await csss_agent.run_csss_application(data)
        elif portal == "minority":
            result = await minority_agent.run_minority_application(data)
        else:
            result = await graph.run_application(data)

        conf = result.get("submission_result", {}).get("confirmation_number")
        if conf:
            return (_format_submission_success_reply(phone, conf), "completed", data)

        error = result.get("error", "Unknown error")
        return (f"❌ Failed: {error}\nType restart", "completed", data)
    except Exception as e:
        return (f"❌ Error: {str(e)}\nType restart", "completed", data)


async def _advance(session_id, step: int, form_state: dict, status: str = "in_progress"):
    """Fire-and-forget live session update."""
    if not session_id:
        return
    try:
        from gov_agent.live_router import advance_live_session
        await advance_live_session(session_id, step, form_state, status)
    except Exception:
        pass
