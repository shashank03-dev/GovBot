from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timezone
from typing import Any

from gov_agent.db import supabase


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_phone(value: str | None) -> str:
    return str(value or "").strip()


def _normalize_portal(value: str | None) -> str:
    return str(value or "").strip().lower() or "nsp"


def _submitted_sort_value(row: dict[str, Any]) -> str:
    return str(row.get("submitted_at") or "")


def latest_applications_by_phone_portal(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    sorted_rows = sorted(
        [dict(row) for row in rows if isinstance(row, dict)],
        key=_submitted_sort_value,
        reverse=True,
    )
    latest: dict[tuple[str, str], dict[str, Any]] = {}
    passthrough: list[dict[str, Any]] = []
    for row in sorted_rows:
        phone = _normalize_phone(row.get("phone"))
        portal = _normalize_portal(row.get("portal"))
        if not phone:
            passthrough.append(row)
            continue
        key = (phone, portal)
        if key in latest:
            continue
        latest[key] = row
    return [*latest.values(), *passthrough]


def _latest_existing_application(client: Any, phone: str, portal: str) -> dict[str, Any] | None:
    result = (
        client.table("applications")
        .select("id, phone, portal, confirmation_number, submitted_at")
        .eq("phone", phone)
        .eq("portal", portal)
        .order("submitted_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = list(result.data or [])
    return dict(rows[0]) if rows else None


def _update_existing_application(
    client: Any,
    existing: dict[str, Any],
    payload: dict[str, Any],
) -> dict[str, Any]:
    confirmation_number = str(payload["confirmation_number"])
    query = client.table("applications").update(payload)
    if existing.get("id"):
        query = query.eq("id", existing["id"])
    else:
        query = query.eq("confirmation_number", confirmation_number)
    result = query.execute()
    rows = list(result.data or [])
    return dict(rows[0]) if rows else {**existing, **payload}


def save_latest_application(
    *,
    phone: str,
    portal: str,
    service: str,
    status: str,
    timeline_steps: list[dict[str, Any]],
    confirmation_number_factory: Callable[[], str],
    db_client: Any | None = None,
) -> dict[str, Any]:
    client = db_client or supabase
    normalized_phone = _normalize_phone(phone)
    normalized_portal = _normalize_portal(portal)
    existing = _latest_existing_application(client, normalized_phone, normalized_portal)
    confirmation_number = str((existing or {}).get("confirmation_number") or confirmation_number_factory()).strip()
    payload = {
        "phone": normalized_phone,
        "confirmation_number": confirmation_number,
        "service": str(service or "").strip(),
        "status": str(status or "submitted").strip() or "submitted",
        "portal": normalized_portal,
        "timeline_steps": list(timeline_steps or []),
        "submitted_at": _now_iso(),
    }

    if existing:
        return _update_existing_application(client, existing, payload)

    try:
        result = client.table("applications").insert(payload).execute()
    except Exception:
        concurrent_existing = _latest_existing_application(client, normalized_phone, normalized_portal)
        if not concurrent_existing:
            raise
        payload["confirmation_number"] = str(concurrent_existing.get("confirmation_number") or confirmation_number)
        return _update_existing_application(client, concurrent_existing, payload)
    rows = list(result.data or [])
    return dict(rows[0]) if rows else payload
