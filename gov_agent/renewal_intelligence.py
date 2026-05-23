from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from gov_agent.db import supabase

PORTAL_LABELS = {
    "nsp": "NSP",
    "pmss": "PMSS",
    "csss": "CSSS",
    "minority": "Minority",
}

DOCUMENT_LABELS = {
    "pan": "PAN Card",
    "aadhaar": "Aadhaar Card",
    "income_cert": "Income Certificate",
    "caste_cert": "Caste Certificate",
    "marksheet": "Marksheet",
}


def _coerce_today(today: Optional[str | date]) -> date:
    if isinstance(today, date):
        return today
    if isinstance(today, str):
        return datetime.strptime(today, "%Y-%m-%d").date()
    return date.today()


def _days_until(day: date, today: date) -> int:
    return (day - today).days


def _format_date(value: str) -> str:
    return datetime.strptime(value, "%Y-%m-%d").strftime("%d %b %Y")


def _build_document_expiries(phone: str, today: date) -> list[dict]:
    response = (
        supabase.table("user_documents")
        .select("id, doc_type, expiry_date, created_at")
        .eq("phone", phone)
        .order("created_at", desc=True)
        .execute()
    )

    latest_by_type: dict[str, dict] = {}
    for row in response.data or []:
        doc_type = row.get("doc_type")
        if not doc_type or doc_type in latest_by_type:
            continue
        expiry_date = row.get("expiry_date")
        if not expiry_date:
            continue
        expiry_day = datetime.strptime(expiry_date, "%Y-%m-%d").date()
        latest_by_type[doc_type] = {
            "id": row.get("id"),
            "doc_type": doc_type,
            "label": DOCUMENT_LABELS.get(doc_type, doc_type.replace("_", " ").title()),
            "expiry_date": expiry_date,
            "days_until": _days_until(expiry_day, today),
        }

    return sorted(latest_by_type.values(), key=lambda item: item["expiry_date"])


def _build_renewal_reminders(phone: str, today: date) -> list[dict]:
    response = (
        supabase.table("renewal_reminders")
        .select("id, portal, renewal_due_date, sent_at, created_at")
        .eq("phone", phone)
        .order("renewal_due_date", desc=False)
        .execute()
    )

    items = []
    for row in response.data or []:
        renewal_due_date = row.get("renewal_due_date")
        portal = row.get("portal")
        if not renewal_due_date or not portal:
            continue
        due_day = datetime.strptime(renewal_due_date, "%Y-%m-%d").date()
        items.append(
            {
                "id": row.get("id"),
                "portal": portal,
                "label": PORTAL_LABELS.get(portal, portal.upper()),
                "renewal_due_date": renewal_due_date,
                "days_until": _days_until(due_day, today),
                "sent_at": row.get("sent_at"),
            }
        )

    return items


def build_summary(phone: str, today: Optional[str | date] = None) -> dict:
    base_day = _coerce_today(today)
    return {
        "phone": phone,
        "document_expiries": _build_document_expiries(phone, base_day),
        "renewal_reminders": _build_renewal_reminders(phone, base_day),
    }


def build_whatsapp_summary(phone: str, portal: Optional[str] = None, today: Optional[str | date] = None) -> str:
    summary = build_summary(phone, today=today)
    document_expiries = summary["document_expiries"]
    renewal_reminders = summary["renewal_reminders"]

    if portal:
        renewal_reminders = [item for item in renewal_reminders if item["portal"] == portal]

    if not document_expiries and not renewal_reminders:
        return "I couldn't find any saved expiry or renewal date yet."

    lines = []

    if document_expiries:
        for item in document_expiries[:3]:
            lines.append(f"Your {item['label']} expires on {_format_date(item['expiry_date'])}.")

    if renewal_reminders:
        for item in renewal_reminders[:3]:
            lines.append(f"Your {item['label']} renewal is due on {_format_date(item['renewal_due_date'])}.")

    if document_expiries and renewal_reminders:
        lines.append("I'll remind you before each deadline.")
    else:
        lines.append("I'll remind you before the deadline.")

    return "\n".join(lines)
