"""WhatsApp over Twilio (works with the free Twilio WhatsApp Sandbox).

Used when WHATSAPP_PROVIDER=twilio. The rest of the app keeps speaking the
Meta Cloud API shapes: ``whatsapp_sender`` builds Meta payloads and hands them
here to translate, and the Twilio webhook turns Twilio's form post into the same
``WhatsAppIncoming`` the Meta webhook produces.

Phone numbers stay in the Meta form the database already uses (country code +
number, digits only, e.g. "919632363213"), so existing users are recognised.
For inbound media the Twilio media URL takes the place of Meta's media id, and
``download_media`` fetches it with the account's credentials.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Mapping
from urllib.parse import urlsplit

import httpx

from gov_agent.config import TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM

logger = logging.getLogger(__name__)

TWILIO_API_HOST = "api.twilio.com"
# Twilio rejects WhatsApp bodies over 1600 characters.
MAX_BODY_CHARS = 1600
_MAX_RETRIES = 3
_BACKOFF_BASE_SECONDS = 1.0
_MAX_MEDIA_BYTES = 16 * 1024 * 1024  # WhatsApp's own document cap


def is_configured() -> bool:
    return bool(TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_WHATSAPP_FROM)


def phone_from_address(address: str) -> str:
    """'whatsapp:+919632363213' -> '919632363213' (the Meta-style id the DB uses)."""
    value = address.strip()
    if value.lower().startswith("whatsapp:"):
        value = value[len("whatsapp:"):]
    return "".join(ch for ch in value if ch.isdigit())


def address_for_phone(phone: str) -> str:
    """'919632363213' or '+91 96323 63213' -> 'whatsapp:+919632363213'."""
    digits = "".join(ch for ch in str(phone) if ch.isdigit())
    return f"whatsapp:+{digits}"


def split_body(body: str, limit: int = MAX_BODY_CHARS) -> list[str]:
    """Split a long reply into Twilio-sized chunks, preferring line breaks."""
    text = body or ""
    if len(text) <= limit:
        return [text]
    chunks: list[str] = []
    while len(text) > limit:
        cut = text.rfind("\n", 0, limit)
        if cut <= 0:
            cut = text.rfind(" ", 0, limit)
        if cut <= 0:
            cut = limit
        chunks.append(text[:cut].rstrip())
        text = text[cut:].lstrip("\n ")
    if text:
        chunks.append(text)
    return chunks


def messages_for_payload(payload: Mapping[str, Any]) -> list[dict[str, str]]:
    """Translate a Meta Cloud API send payload into Twilio Messages API params."""
    to = address_for_phone(str(payload.get("to", "")))
    kind = payload.get("type")
    base = {"From": TWILIO_WHATSAPP_FROM, "To": to}

    if kind == "text":
        body = str((payload.get("text") or {}).get("body", ""))
        return [{**base, "Body": chunk} for chunk in split_body(body)]

    if kind in ("image", "document"):
        media = payload.get(kind) or {}
        return [{**base, "MediaUrl": str(media.get("link", ""))}]

    if kind == "template":
        # Meta templates (the OTP) don't exist on Twilio; inside the sandbox's
        # 24-hour session a plain message is allowed, so send the code as text.
        params = []
        for component in (payload.get("template") or {}).get("components", []):
            params.extend(p.get("text", "") for p in component.get("parameters", []))
        code = params[0] if params else ""
        return [{**base, "Body": f"Your GovBot OTP is: {code}\nValid for 10 minutes."}]

    raise ValueError(f"Unsupported WhatsApp payload type for Twilio: {kind!r}")


async def _post_message(client: httpx.AsyncClient, params: dict[str, str]) -> str | None:
    """Send one Twilio message with retries. Returns None on success, else the error."""
    url = f"https://{TWILIO_API_HOST}/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json"
    last_error = "unknown error"
    for attempt in range(1, _MAX_RETRIES + 1):
        try:
            response = await client.post(url, data=params, auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN))
            if response.status_code in (200, 201):
                logger.info("Twilio WhatsApp message queued to %s: sid=%s", params["To"], _sid(response))
                return None
            last_error = f"HTTP {response.status_code}: {response.text}"
            # 4xx (bad number, recipient hasn't joined the sandbox, ...) won't
            # fix itself on retry; 429 and 5xx might.
            if 400 <= response.status_code < 500 and response.status_code != 429:
                break
        except httpx.HTTPError as exc:
            last_error = str(exc) or type(exc).__name__
        logger.warning("Twilio WhatsApp send failed (attempt %d/%d): %s", attempt, _MAX_RETRIES, last_error)
        if attempt < _MAX_RETRIES:
            await asyncio.sleep(_BACKOFF_BASE_SECONDS * (2 ** (attempt - 1)))
    return last_error


def _sid(response: httpx.Response) -> str:
    try:
        return str(response.json().get("sid", ""))
    except ValueError:
        return ""


async def send_payload(payload: Mapping[str, Any]) -> dict[str, Any]:
    """Send a Meta-shaped payload through Twilio. Same result shape as the Meta sender."""
    if not is_configured():
        return {"error": "Twilio WhatsApp is not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM)"}
    try:
        messages = messages_for_payload(payload)
    except ValueError as exc:
        return {"error": str(exc)}

    async with httpx.AsyncClient(timeout=15.0) as client:
        for params in messages:
            error = await _post_message(client, params)
            if error is not None:
                logger.error("Twilio WhatsApp send to %s failed: %s", params["To"], error)
                return {"error": error}
    return {"ok": True}


def twiml_for_payloads(payloads: list[Mapping[str, Any]]) -> str:
    """Build a TwiML <Response> that replies with these Meta-shaped payloads."""
    from twilio.twiml.messaging_response import MessagingResponse

    twiml = MessagingResponse()
    for payload in payloads:
        for params in messages_for_payload(payload):
            if params.get("MediaUrl"):
                twiml.message().media(params["MediaUrl"])
            elif params.get("Body"):
                twiml.message(params["Body"])
    return str(twiml)


def is_twilio_media_url(value: str | None) -> bool:
    if not value:
        return False
    parts = urlsplit(value)
    return parts.scheme == "https" and parts.hostname == TWILIO_API_HOST


async def download_media(url: str) -> tuple[bytes, str, str | None]:
    """Fetch inbound media from Twilio. Only api.twilio.com URLs are accepted,
    so the account credentials are never sent anywhere else (httpx drops the
    auth header when Twilio redirects to its storage host)."""
    if not is_twilio_media_url(url):
        raise ValueError("Not a Twilio media URL")
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        response = await client.get(url, auth=(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN))
        response.raise_for_status()
        if len(response.content) > _MAX_MEDIA_BYTES:
            raise ValueError("Media file is larger than 16 MB")
        mime_type = response.headers.get("content-type", "image/jpeg").split(";")[0].strip()
        return response.content, mime_type or "image/jpeg", None
