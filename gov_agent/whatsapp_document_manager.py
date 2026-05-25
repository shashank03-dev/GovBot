from __future__ import annotations

from datetime import datetime, timezone
from difflib import SequenceMatcher
from typing import Any

UNLOCK_WINDOW_SECONDS = 10 * 60

DOCUMENT_HUB_STATE = "document_hub"
DOCUMENT_SELECT_STATE = "document_select"
DOCUMENT_UPLOAD_CHOOSE_STATE = "document_upload_choose"
DOCUMENT_CUSTOM_UPLOAD_LABEL_STATE = "document_custom_upload_label"
DOCUMENT_EDIT_MODE_STATE = "document_edit_mode"
DOCUMENT_EDIT_FIELD_STATE = "document_edit_field"
DOCUMENT_EDIT_VALUE_STATE = "document_edit_value"
DOCUMENT_REPLACE_FILE_STATE = "document_replace_file"
DOCUMENT_DELETE_CONFIRM_STATE = "document_delete_confirm"

BUILTIN_DOC_TYPES = {
    "pan": ("pan", "pan card"),
    "aadhaar": ("aadhaar", "aadhaar card", "aadhar", "adhaar"),
    "income_cert": ("income cert", "income certificate", "income"),
    "caste_cert": ("caste cert", "caste certificate", "caste"),
    "marksheet": ("marksheet", "marksheet"),
}

EDITABLE_CUSTOM_FIELDS = {
    "label": "__custom_label__",
    "name": "__custom_label__",
    "summary": "summary",
    "type": "document_type_hint",
    "document type": "document_type_hint",
    "reference": "reference_number",
    "reference number": "reference_number",
    "issue date": "issue_date",
    "valid until": "valid_until",
    "key points": "key_points",
}


def normalize_text(text: str) -> str:
    return " ".join(str(text or "").strip().lower().split())


def _score(candidate: str, query: str) -> float:
    return SequenceMatcher(None, candidate, query).ratio()


def _fuzzy_match_token(token: str, choices: list[str], *, threshold: float = 0.78) -> str | None:
    normalized = normalize_text(token)
    if not normalized:
        return None
    if normalized in choices:
        return normalized
    scored = sorted(((choice, _score(choice, normalized)) for choice in choices), key=lambda item: item[1], reverse=True)
    if not scored:
        return None
    best_choice, best_score = scored[0]
    next_score = scored[1][1] if len(scored) > 1 else 0.0
    if best_score < threshold:
        return None
    if best_score - next_score < 0.06:
        return None
    return best_choice


def parse_document_command(text: str) -> dict[str, Any] | None:
    normalized = normalize_text(text)
    if not normalized:
        return None

    if normalized == "my docs":
        return {"kind": "list"}

    hub_match = _fuzzy_match_token(normalized, ["documents", "docs"], threshold=0.72)
    if hub_match:
        return {"kind": "hub"}

    parts = normalized.split()
    first = parts[0]
    action = _fuzzy_match_token(first, ["upload", "send", "edit", "delete"], threshold=0.72)
    if not action:
        return None

    rest = normalize_text(normalized[len(first):])
    if action == "upload":
        doc_type = match_document_type(rest)
        if doc_type:
            return {"kind": "upload", "doc_type": doc_type}
        return {"kind": "upload_unknown"}
    if rest:
        return {"kind": action, "target": rest}
    return {"kind": action, "target": ""}


def match_document_menu_action(text: str) -> str | None:
    normalized = normalize_text(text)
    if normalized in {"1", "view"}:
        return "view"
    if normalized in {"2", "upload"}:
        return "upload"
    if normalized in {"3", "send"}:
        return "send"
    if normalized in {"4", "edit"}:
        return "edit"
    if normalized in {"5", "delete"}:
        return "delete"
    if normalized in {"6", "open vault", "vault"}:
        return "open_vault"
    if normalized in {"list", "my docs"}:
        return "list"
    return _fuzzy_match_token(normalized, ["view", "upload", "send", "edit", "delete", "open vault"], threshold=0.72)


def match_document_type(text: str) -> str | None:
    normalized = normalize_text(text)
    if not normalized:
        return None
    if normalized == "custom":
        return "custom"
    for doc_type, aliases in BUILTIN_DOC_TYPES.items():
        if normalized in aliases:
            return doc_type
        if any(alias in normalized for alias in aliases):
            return doc_type
    token_match = _fuzzy_match_token(normalized, [alias for aliases in BUILTIN_DOC_TYPES.values() for alias in aliases] + ["custom"], threshold=0.74)
    if token_match == "custom":
        return "custom"
    if token_match:
        for doc_type, aliases in BUILTIN_DOC_TYPES.items():
            if token_match in aliases:
                return doc_type
    return None


def pick_custom_document(query: str, documents: list[dict[str, Any]]) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    normalized_query = normalize_text(query)
    if not normalized_query:
        return None, []

    exact_matches = [
        document
        for document in documents
        if normalize_text(document.get("custom_label", "")) == normalized_query
    ]
    if len(exact_matches) == 1:
        return exact_matches[0], []
    if len(exact_matches) > 1:
        return None, exact_matches

    contains_matches = [
        document
        for document in documents
        if normalized_query in normalize_text(document.get("custom_label", ""))
    ]
    if len(contains_matches) == 1:
        return contains_matches[0], []
    if len(contains_matches) > 1:
        return None, contains_matches

    scored = []
    for document in documents:
        label = normalize_text(document.get("custom_label", ""))
        if not label:
            continue
        score = _score(label, normalized_query)
        token_overlap = len(set(label.split()) & set(normalized_query.split()))
        if token_overlap:
            score = max(score, min(0.95, 0.6 + 0.1 * token_overlap))
        scored.append((document, score))
    scored.sort(key=lambda item: item[1], reverse=True)
    if not scored or scored[0][1] < 0.7:
        return None, []
    if len(scored) == 1 or scored[0][1] - scored[1][1] >= 0.08:
        return scored[0][0], []
    candidates = [document for document, score in scored[:5] if score >= scored[0][1] - 0.05]
    return None, candidates


def document_label(document: dict[str, Any]) -> str:
    doc_type = str(document.get("doc_type") or "")
    if doc_type == "custom":
        return str(document.get("custom_label") or "Custom Document").strip() or "Custom Document"
    labels = {
        "pan": "PAN card",
        "aadhaar": "Aadhaar card",
        "income_cert": "Income certificate",
        "caste_cert": "Caste certificate",
        "marksheet": "Marksheet",
    }
    return labels.get(doc_type, doc_type.replace("_", " ").title())


def render_document_hub() -> str:
    return (
        "🗂️ *Document Manager*\n\n"
        "1. View\n"
        "2. Upload\n"
        "3. Send\n"
        "4. Edit\n"
        "5. Delete\n"
        "6. Open Vault\n\n"
        "You can also type commands like *my docs*, *upload custom*, *send pan*, *edit domicile certificate*, or *delete aadhaar*."
    )


def render_document_list(documents: list[dict[str, Any]], *, heading: str = "📄 *Your Documents*") -> str:
    if not documents:
        return (
            f"{heading}\n\n"
            "No saved documents yet.\n\n"
            "Reply *UPLOAD* to add one or *OPEN VAULT* for the website."
        )
    lines = [heading, ""]
    for index, document in enumerate(documents, start=1):
        line = f"{index}. {document_label(document)}"
        summary = str((document.get("extracted_data") or {}).get("summary") or "").strip()
        status = str(document.get("status") or "").strip()
        if summary:
            line += f" — {summary}"
        elif status:
            line += f" — {status}"
        lines.append(line)
    lines.extend(["", "Reply with the number or document name, or type *BACK* to return to Document Manager."])
    return "\n".join(lines)


def editable_fields_for_document(document: dict[str, Any]) -> dict[str, str]:
    if document.get("doc_type") == "custom":
        return dict(EDITABLE_CUSTOM_FIELDS)
    extracted = document.get("extracted_data") or {}
    fields: dict[str, str] = {}
    for key in extracted.keys():
        pretty = key.replace("_", " ")
        fields[pretty] = key
        fields[key] = key
    return fields


def match_edit_field(document: dict[str, Any], text: str) -> tuple[str | None, str | None]:
    normalized = normalize_text(text)
    fields = editable_fields_for_document(document)
    if normalized in fields:
        return fields[normalized], normalized
    choice = _fuzzy_match_token(normalized, list(fields.keys()), threshold=0.72)
    if choice:
        return fields[choice], choice
    return None, None


def render_edit_field_prompt(document: dict[str, Any]) -> str:
    if document.get("doc_type") == "custom":
        return (
            f"✏️ Editing *{document_label(document)}*\n\n"
            "Reply with the field name to change:\n"
            "- LABEL\n"
            "- SUMMARY\n"
            "- TYPE\n"
            "- REFERENCE\n"
            "- ISSUE DATE\n"
            "- VALID UNTIL\n"
            "- KEY POINTS"
        )
    field_names = sorted({value for value in editable_fields_for_document(document).values()})
    lines = [f"✏️ Editing *{document_label(document)}*", "", "Reply with the field name to change:"]
    for field_name in field_names:
        lines.append(f"- {field_name.replace('_', ' ').upper()}")
    return "\n".join(lines)


def activate_unlock(data: dict[str, Any], *, now: datetime | None = None) -> dict[str, Any]:
    current = now or datetime.now(timezone.utc)
    stamp = current.isoformat()
    next_data = dict(data)
    next_data["document_access_unlock"] = {
        "verified_at": stamp,
        "last_activity_at": stamp,
    }
    return next_data


def touch_unlock(data: dict[str, Any], *, now: datetime | None = None) -> dict[str, Any]:
    current = now or datetime.now(timezone.utc)
    next_data = dict(data)
    unlock = dict(next_data.get("document_access_unlock") or {})
    if not unlock:
        return activate_unlock(next_data, now=current)
    unlock["last_activity_at"] = current.isoformat()
    unlock.setdefault("verified_at", current.isoformat())
    next_data["document_access_unlock"] = unlock
    return next_data


def clear_unlock(data: dict[str, Any]) -> dict[str, Any]:
    next_data = dict(data)
    next_data.pop("document_access_unlock", None)
    return next_data


def is_unlock_active(data: dict[str, Any], *, now: datetime | None = None) -> bool:
    unlock = data.get("document_access_unlock")
    if not isinstance(unlock, dict):
        return False
    current = now or datetime.now(timezone.utc)
    last_activity = unlock.get("last_activity_at") or unlock.get("verified_at")
    if not isinstance(last_activity, str) or not last_activity.strip():
        return False
    try:
        last_seen = datetime.fromisoformat(last_activity)
    except ValueError:
        return False
    if last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=timezone.utc)
    return (current - last_seen).total_seconds() <= UNLOCK_WINDOW_SECONDS


def protected_action(action: str) -> bool:
    return action in {"view", "send", "edit", "replace", "delete"}
