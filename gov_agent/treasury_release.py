from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import HTTPException, status

from gov_agent import config
from gov_agent.db import supabase
from gov_agent.npci_agent import _demo_amount_for_portal, ensure_disbursement_ready

logger = logging.getLogger(__name__)

KNOWN_SCHEMES = ("nsp", "ssp")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _ledger_path() -> Path:
    return Path(config.TREASURY_LEDGER_FILE).expanduser()


def _normalize_scheme(value: str | None) -> str:
    return str(value or "").strip().lower()


def _parse_iso(value: str | None) -> datetime | None:
    raw = str(value or "").strip()
    if not raw:
        return None
    normalized = raw.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def _build_explorer_url(tx_hash: str | None) -> str | None:
    raw_hash = str(tx_hash or "").strip()
    if not raw_hash:
        return None
    base_url = str(config.TREASURY_EXPLORER_BASE_URL or "").rstrip("/")
    if not base_url:
        return None
    return f"{base_url}/{raw_hash}"


def _default_sanctions() -> list[dict[str, Any]]:
    raw = str(config.TREASURY_SANCTIONS_JSON or "").strip() or "[]"
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        logger.warning("Invalid TREASURY_SANCTIONS_JSON. Falling back to empty sanctions.")
        return []

    sanctions: list[dict[str, Any]] = []
    for item in payload if isinstance(payload, list) else []:
        scheme = _normalize_scheme(item.get("scheme"))
        if not scheme:
            continue
        sanctions.append(
            {
                "scheme": scheme,
                "amount_inr": float(item.get("amount_inr") or 0),
                "sanction_tx_hash": str(item.get("sanction_tx_hash") or "").strip(),
                "sanctioned_at": str(item.get("sanctioned_at") or "").strip() or _now_iso(),
                "authority": str(item.get("authority") or "Central Treasury").strip(),
            }
        )
    return sanctions


def load_ledger() -> dict[str, list[dict[str, Any]]]:
    ledger_path = _ledger_path()
    data: dict[str, Any] = {}
    if ledger_path.exists():
        try:
            data = json.loads(ledger_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            logger.warning("Treasury ledger file is invalid JSON. Resetting to defaults.")
            data = {}

    sanctions = _default_sanctions() or list(data.get("sanctions") or [])
    releases = list(data.get("releases") or [])
    return {"sanctions": sanctions, "releases": releases}


def save_ledger(data: dict[str, Any]) -> None:
    ledger_path = _ledger_path()
    ledger_path.parent.mkdir(parents=True, exist_ok=True)
    ledger_path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _list_applications() -> list[dict[str, Any]]:
    result = (
        supabase.table("applications")
        .select("confirmation_number, phone, portal, submitted_at, status")
        .order("submitted_at", desc=True)
        .execute()
    )
    return list(result.data or [])


def _verified_phones() -> set[str]:
    result = (
        supabase.table("bank_verifications")
        .select("phone")
        .eq("verified", True)
        .execute()
    )
    return {str(row.get("phone") or "") for row in (result.data or []) if row.get("phone")}


def _record_activity(phone: str, event: str) -> None:
    supabase.table("activity_feed").insert(
        {
            "phone": phone,
            "event": event,
            "created_at": _now_iso(),
        }
    ).execute()


def _mark_disbursement_processing(confirmation_number: str) -> None:
    supabase.table("disbursement_tracking").update(
        {"status": "processing", "updated_at": _now_iso()}
    ).eq("confirmation_number", confirmation_number).execute()


def _release_cutoff_by_scheme(releases: list[dict[str, Any]]) -> dict[str, datetime]:
    cutoffs: dict[str, datetime] = {}
    for release in releases:
        scheme = _normalize_scheme(release.get("scheme"))
        released_at = _parse_iso(release.get("released_at"))
        if not scheme or released_at is None:
            continue
        current = cutoffs.get(scheme)
        if current is None or released_at > current:
            cutoffs[scheme] = released_at
    return cutoffs


def _released_amount_by_scheme(releases: list[dict[str, Any]]) -> dict[str, float]:
    totals: dict[str, float] = {}
    for release in releases:
        scheme = _normalize_scheme(release.get("scheme"))
        if not scheme:
            continue
        totals[scheme] = totals.get(scheme, 0.0) + float(release.get("amount_inr") or 0)
    return totals


def _pending_applications_by_scheme(
    applications: list[dict[str, Any]],
    releases: list[dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    cutoffs = _release_cutoff_by_scheme(releases)
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in applications:
        scheme = _normalize_scheme(row.get("portal"))
        if not scheme:
            continue
        status_value = str(row.get("status") or "").strip().lower()
        if status_value == "rejected":
            continue
        submitted_at = _parse_iso(row.get("submitted_at"))
        latest_release = cutoffs.get(scheme)
        if latest_release is not None and submitted_at is not None and submitted_at <= latest_release:
            continue
        grouped.setdefault(scheme, []).append(row)
    return grouped


def _scheme_label(scheme: str) -> str:
    return str(scheme or "").upper()


def build_treasury_summary(official: dict[str, str]) -> dict[str, Any]:
    ledger = load_ledger()
    applications = _list_applications()
    verified_phones = _verified_phones()
    pending_by_scheme = _pending_applications_by_scheme(applications, ledger["releases"])
    released_amounts = _released_amount_by_scheme(ledger["releases"])

    scheme_names = {item["scheme"] for item in ledger["sanctions"] if item.get("scheme")}
    scheme_names.update(pending_by_scheme.keys())
    scheme_names.update(KNOWN_SCHEMES)

    schemes: list[dict[str, Any]] = []
    for scheme in sorted(scheme_names):
        sanctions = [item for item in ledger["sanctions"] if _normalize_scheme(item.get("scheme")) == scheme]
        sanctioned_amount = sum(float(item.get("amount_inr") or 0) for item in sanctions)
        pending_rows = pending_by_scheme.get(scheme, [])
        ready_count = sum(1 for item in pending_rows if str(item.get("phone") or "") in verified_phones)
        blocked_count = len(pending_rows) - ready_count
        pending_amount = len(pending_rows) * float(_demo_amount_for_portal(scheme))
        latest_sanction = sanctions[-1] if sanctions else {}
        latest_release = next(
            (item for item in reversed(ledger["releases"]) if _normalize_scheme(item.get("scheme")) == scheme),
            {},
        )
        released_amount = released_amounts.get(scheme, 0.0)
        schemes.append(
            {
                "scheme": scheme,
                "label": _scheme_label(scheme),
                "sanctioned_amount_inr": sanctioned_amount,
                "released_amount_inr": released_amount,
                "available_amount_inr": max(sanctioned_amount - released_amount, 0.0),
                "pending_beneficiary_count": len(pending_rows),
                "ready_beneficiary_count": ready_count,
                "blocked_beneficiary_count": blocked_count,
                "pending_release_amount_inr": pending_amount,
                "latest_sanction_tx_hash": latest_sanction.get("sanction_tx_hash") or None,
                "latest_sanction_explorer_url": _build_explorer_url(latest_sanction.get("sanction_tx_hash")),
                "latest_release_tx_hash": latest_release.get("tx_hash") or None,
                "latest_release_explorer_url": _build_explorer_url(latest_release.get("tx_hash")),
            }
        )

    recent_releases = []
    for item in reversed(ledger["releases"]):
        release = dict(item)
        release["explorer_url"] = _build_explorer_url(release.get("tx_hash"))
        recent_releases.append(release)

    return {
        "official": official,
        "wallet": {
            "chain_id": config.TREASURY_CHAIN_ID,
            "network_name": config.TREASURY_NETWORK_NAME,
            "approved_wallet_address": config.TREASURY_APPROVED_WALLET,
            "release_anchor_address": config.TREASURY_RELEASE_ANCHOR_ADDRESS,
            "explorer_base_url": config.TREASURY_EXPLORER_BASE_URL,
        },
        "schemes": schemes,
        "recent_releases": recent_releases[:10],
    }


def _candidate_rows_for_scheme(scheme: str) -> tuple[list[dict[str, Any]], set[str], dict[str, Any]]:
    ledger = load_ledger()
    applications = _list_applications()
    verified_phones = _verified_phones()
    pending_by_scheme = _pending_applications_by_scheme(applications, ledger["releases"])
    return pending_by_scheme.get(scheme, []), verified_phones, ledger


def record_release(official: dict[str, str], tx_hash: str, wallet_address: str, scheme: str) -> dict[str, Any]:
    normalized_scheme = _normalize_scheme(scheme)
    normalized_wallet = str(wallet_address or "").strip().lower()
    normalized_tx_hash = str(tx_hash or "").strip()

    if not config.TREASURY_APPROVED_WALLET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Treasury approved wallet is not configured",
        )

    if normalized_wallet != config.TREASURY_APPROVED_WALLET:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Wallet not approved for release")

    if not normalized_tx_hash:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Transaction hash is required")

    candidates, verified_phones, ledger = _candidate_rows_for_scheme(normalized_scheme)
    if not candidates:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="No pending beneficiaries for scheme")

    summary = build_treasury_summary(official)
    scheme_summary = next((item for item in summary["schemes"] if item["scheme"] == normalized_scheme), None)
    if scheme_summary is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Scheme not configured")

    if scheme_summary["pending_release_amount_inr"] > scheme_summary["available_amount_inr"]:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Insufficient sanctioned balance")

    release = {
        "release_id": f"{normalized_scheme}-{int(datetime.now(timezone.utc).timestamp())}",
        "scheme": normalized_scheme,
        "amount_inr": scheme_summary["pending_release_amount_inr"],
        "beneficiary_count": len(candidates),
        "ready_count": scheme_summary["ready_beneficiary_count"],
        "blocked_count": scheme_summary["blocked_beneficiary_count"],
        "tx_hash": normalized_tx_hash,
        "wallet_address": normalized_wallet,
        "released_at": _now_iso(),
        "official_username": official["username"],
        "authority": "Department Release Wallet",
    }

    for row in candidates:
        phone = str(row.get("phone") or "")
        confirmation_number = str(row.get("confirmation_number") or "")
        if phone in verified_phones:
            ensure_disbursement_ready(phone)
            _mark_disbursement_processing(confirmation_number)
            _record_activity(phone, "🏛️ Scholarship funds released. Bank credit is now processing.")
        else:
            _record_activity(phone, "🏛️ Scholarship funds released. Verify your bank details now to receive payment.")

    ledger["releases"].append(release)
    save_ledger(ledger)

    release["explorer_url"] = _build_explorer_url(normalized_tx_hash)
    return release


def build_public_release_feed() -> dict[str, Any]:
    ledger = load_ledger()
    sanctions = []
    for item in ledger["sanctions"]:
        row = dict(item)
        row["explorer_url"] = _build_explorer_url(row.get("sanction_tx_hash"))
        sanctions.append(row)

    releases = []
    for item in reversed(ledger["releases"]):
        row = dict(item)
        row["explorer_url"] = _build_explorer_url(row.get("tx_hash"))
        releases.append(row)

    return {"sanctions": sanctions, "releases": releases}


def get_beneficiary_release_status(phone: str) -> dict[str, Any]:
    ledger = load_ledger()
    verified_phones = _verified_phones()
    applications = [
        item
        for item in _list_applications()
        if str(item.get("phone") or "") == str(phone or "").strip()
    ]
    if not applications:
        return {
            "phone": phone,
            "release_authorized": False,
            "bank_verified": str(phone or "").strip() in verified_phones,
            "action_required": "none",
            "message": "No scholarship application found for release tracking.",
        }

    latest_application = sorted(
        applications,
        key=lambda row: str(row.get("submitted_at") or ""),
        reverse=True,
    )[0]
    scheme = _normalize_scheme(latest_application.get("portal"))
    submitted_at = _parse_iso(latest_application.get("submitted_at"))
    latest_release = next(
        (
            item
            for item in reversed(ledger["releases"])
            if _normalize_scheme(item.get("scheme")) == scheme
            and (
                submitted_at is None
                or (_parse_iso(item.get("released_at")) or datetime.min.replace(tzinfo=timezone.utc)) >= submitted_at
            )
        ),
        None,
    )

    bank_verified = str(phone or "").strip() in verified_phones
    if latest_release is None:
        return {
            "phone": phone,
            "confirmation_number": latest_application.get("confirmation_number"),
            "scheme": scheme,
            "release_authorized": False,
            "bank_verified": bank_verified,
            "action_required": "none",
            "message": "Funds have not been released for your scholarship yet.",
        }

    action_required = "none" if bank_verified else "verify_bank"
    message = (
        "Funds have been released and bank credit is being processed."
        if bank_verified
        else "Funds have been released. Verify your bank details as soon as possible to receive payment."
    )
    return {
        "phone": phone,
        "confirmation_number": latest_application.get("confirmation_number"),
        "scheme": scheme,
        "release_authorized": True,
        "bank_verified": bank_verified,
        "action_required": action_required,
        "message": message,
        "release_tx_hash": latest_release.get("tx_hash"),
        "release_explorer_url": _build_explorer_url(latest_release.get("tx_hash")),
        "released_at": latest_release.get("released_at"),
    }
