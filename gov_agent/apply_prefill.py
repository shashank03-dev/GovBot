"""Profile-driven prefill for the scholarship apply flow.

When a returning citizen starts a scholarship application we already know most of
what the form needs from their saved ``citizen_profiles`` row. These helpers
decide, for a given portal, which required fields are already on file and which
must still be asked, and they render the summary shown before submission.

No database access happens here — callers pass in the loaded profile dict and a
flag for whether the citizen already has a verified bank account. Keeping this
module pure makes the decision logic unit-testable in isolation, separate from
the WhatsApp finite-state machine in ``flow_router``.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Callable

# A validator takes the raw user/profile string and returns
# ``(ok, normalized_value, error_message)``. On success ``error_message`` is "".
Validator = Callable[[str], "tuple[bool, Any, str]"]


def _v_text(raw: str) -> tuple[bool, Any, str]:
    value = str(raw).strip()
    if value:
        return True, value, ""
    return False, None, "Please enter a value."


def _v_dob(raw: str) -> tuple[bool, Any, str]:
    value = str(raw).strip()
    if re.match(r"^\d{2}/\d{2}/\d{4}$", value):
        return True, value, ""
    return False, None, "❌ Invalid format. Use DD/MM/YYYY"


def _v_income(raw: str) -> tuple[bool, Any, str]:
    value = str(raw).strip()
    if value.isdigit():
        return True, int(value), ""
    return False, None, "❌ Enter numbers only"


def _v_marks(raw: str) -> tuple[bool, Any, str]:
    try:
        return True, float(str(raw).strip()), ""
    except ValueError:
        return False, None, "❌ Enter valid percentage (e.g., 85.5)"


def _v_ifsc(raw: str) -> tuple[bool, Any, str]:
    value = str(raw).strip().upper()
    if len(value) == 11:
        return True, value, ""
    return False, None, "❌ Invalid IFSC code. Must be 11 characters (e.g., SBIN0012345)"


def _v_account(raw: str) -> tuple[bool, Any, str]:
    value = str(raw).strip().replace(" ", "")
    if value.isdigit() and len(value) >= 9:
        return True, value, ""
    return False, None, "❌ Invalid account number. Must be 9-18 digits."


@dataclass(frozen=True)
class ApplyField:
    """One form field: how it maps between the session, the profile, and chat."""

    key: str          # session-data key the submission agent reads (e.g. "name")
    profile_key: str  # citizen_profiles column it maps from (e.g. "full_name")
    label: str        # human label shown in the summary ("Name")
    prompt: str       # question asked when the field is missing
    validate: Validator
    sensitive: bool = False  # mask the value when shown in the summary


FIELDS: dict[str, ApplyField] = {
    "name": ApplyField("name", "full_name", "Name", "What is your full name as per Aadhaar?", _v_text),
    "dob": ApplyField("dob", "dob", "DOB", "Date of birth? (DD/MM/YYYY)", _v_dob),
    "income": ApplyField("income", "income", "Income", "Annual family income in ₹?", _v_income),
    "caste": ApplyField("caste", "caste", "Caste", "Caste category? (SC/ST/OBC)", _v_text),
    "institution": ApplyField("institution", "institution", "Institution", "Name of your institution/college?", _v_text),
    "course": ApplyField("course", "course_name", "Course", "Course name?", _v_text),
    "marks_pct": ApplyField("marks_pct", "marks_pct", "Marks %", "Marks percentage in last exam? (e.g., 85.5)", _v_marks),
    "religion": ApplyField("religion", "religion", "Religion", "Your religion? (Muslim/Sikh/Christian/Buddhist/Parsi/Jain)", _v_text),
    "bank_ifsc": ApplyField("bank_ifsc", "bank_ifsc", "Bank IFSC", "Enter your 11-character IFSC code:", _v_ifsc),
    "bank_account": ApplyField("bank_account", "bank_account", "Bank A/C", "Enter your bank account number:", _v_account, sensitive=True),
}

# Text fields each portal's submission agent actually consumes, in ask order.
# Bank fields are appended for NSP separately (only when not already verified);
# the Aadhaar photo is collected at submit and is not listed here.
PORTAL_FIELDS: dict[str, list[str]] = {
    "nsp": ["name", "dob", "income"],
    "ssp": ["name", "dob", "income", "caste", "institution", "course"],
    "csss": ["name", "dob", "income", "marks_pct", "institution", "course"],
    "minority": ["name", "dob", "income", "religion", "institution", "course", "marks_pct"],
}

PORTAL_LABELS: dict[str, str] = {
    "nsp": "NSP",
    "ssp": "SSP",
    "csss": "CSSS",
    "minority": "Minority",
}


def portal_field_keys(portal: str, *, bank_verified: bool = False) -> list[str]:
    """Ordered field keys a portal needs, adding NSP bank fields when unverified."""
    keys = list(PORTAL_FIELDS.get(portal, PORTAL_FIELDS["nsp"]))
    if portal == "nsp" and not bank_verified:
        keys += ["bank_ifsc", "bank_account"]
    return keys


def resolve_prefill(
    profile: dict[str, Any], portal: str, *, bank_verified: bool = False
) -> tuple[dict[str, Any], list[str]]:
    """Split a portal's fields into ``(filled_from_profile, still_missing)``.

    ``filled`` maps session-data keys to normalized values (income coerced to
    int, marks to float, etc.). ``missing`` preserves ask order.
    """
    filled: dict[str, Any] = {}
    missing: list[str] = []
    for key in portal_field_keys(portal, bank_verified=bank_verified):
        field = FIELDS[key]
        raw = profile.get(field.profile_key)
        if raw is not None and str(raw).strip() != "":
            ok, value, _ = field.validate(str(raw))
            filled[key] = value if ok else raw
        else:
            missing.append(key)
    return filled, missing


def is_portal_complete(
    profile: dict[str, Any], portal: str, *, bank_verified: bool = False
) -> bool:
    """True when the saved profile already covers every field this portal needs."""
    _, missing = resolve_prefill(profile, portal, bank_verified=bank_verified)
    return not missing


def _display_value(key: str, value: Any) -> str:
    field = FIELDS[key]
    if key == "income":
        try:
            return f"₹{int(value):,}"
        except (TypeError, ValueError):
            return f"₹{value}"
    if field.sensitive:
        text = str(value)
        return "••••" + text[-4:] if len(text) >= 4 else "••••"
    return str(value)


def build_summary(
    portal: str,
    filled: dict[str, Any],
    missing: list[str],
    *,
    bank_verified: bool = False,
) -> str:
    """Render the 'here's what I already have' message shown before submit."""
    label = PORTAL_LABELS.get(portal, portal.upper())
    lines = [f"✅ I already have your details for {label}:"]
    for key, value in filled.items():
        lines.append(f"• {FIELDS[key].label}: {_display_value(key, value)}")
    if bank_verified and portal == "nsp":
        lines.append("• Bank: ✅ already verified")

    if missing:
        lines.append("")
        lines.append("I still need a few details to submit:")
        for key in missing:
            lines.append(f"• {FIELDS[key].label}")
        lines.append("")
        lines.append(FIELDS[missing[0]].prompt)
    else:
        lines.append("")
        lines.append("Reply *CONFIRM* to submit, or *EDIT <field>* (e.g. EDIT income) to change one.")
    return "\n".join(lines)


def match_edit_field(portal: str, text: str) -> str | None:
    """Resolve an 'EDIT <field>' / 'CHANGE <field>' command to a field key."""
    lowered = text.strip().lower()
    if not (lowered.startswith("edit") or lowered.startswith("change")):
        return None
    parts = lowered.split(None, 1)
    target = parts[1].strip() if len(parts) > 1 else ""
    if not target:
        return None
    keys = portal_field_keys(portal, bank_verified=False)
    for key in keys:
        label = FIELDS[key].label.lower()
        if target in (key, label, label.replace(" ", "")):
            return key
    for key in keys:
        if target in FIELDS[key].label.lower():
            return key
    return None
