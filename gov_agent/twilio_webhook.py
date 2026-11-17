"""Inbound WhatsApp messages from Twilio (WHATSAPP_PROVIDER=twilio).

Twilio posts each message as a form. We check the X-Twilio-Signature, answer
straight away with an empty TwiML response (Twilio gives up after 15 seconds,
and OCR or a cold Gemini call can take longer), and do the work in the
background, sending replies through the Twilio Messages API.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import Response
from twilio.request_validator import RequestValidator

from gov_agent import config, session_manager, twilio_whatsapp, whatsapp_sender
from gov_agent.models import WhatsAppIncoming
from gov_agent.whatsapp_webhook import _mark_message_seen

logger = logging.getLogger(__name__)

router = APIRouter()

_EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'


def _public_url(request: Request) -> str:
    """The URL Twilio signed. Behind Render's proxy the app sees http://, so
    prefer the configured URL, then the X-Forwarded-* headers."""
    if config.TWILIO_WEBHOOK_URL:
        return config.TWILIO_WEBHOOK_URL
    proto = request.headers.get("x-forwarded-proto", request.url.scheme).split(",")[0].strip()
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    url = f"{proto}://{host.split(',')[0].strip()}{request.url.path}"
    if request.url.query:
        url += f"?{request.url.query}"
    return url


def _signature_ok(request: Request, params: dict[str, str]) -> bool:
    if not config.TWILIO_VALIDATE_SIGNATURE:
        return True
    if not config.TWILIO_AUTH_TOKEN:
        logger.warning("Rejecting Twilio webhook: TWILIO_AUTH_TOKEN is not set")
        return False
    signature = request.headers.get("x-twilio-signature", "")
    return RequestValidator(config.TWILIO_AUTH_TOKEN).validate(_public_url(request), params, signature)


def incoming_from_form(form: dict[str, str]) -> WhatsAppIncoming:
    phone = twilio_whatsapp.phone_from_address(form.get("From", ""))
    try:
        media_count = int(form.get("NumMedia") or 0)
    except ValueError:
        media_count = 0

    if media_count > 0:
        media_url = form.get("MediaUrl0") or None
        mime_type = form.get("MediaContentType0") or None
        message_type = "image" if (mime_type or "").startswith("image/") else "document"
        return WhatsAppIncoming(
            phone=phone,
            message_type=message_type,
            body=form.get("Body") or None,
            media_id=media_url,
            mime_type=mime_type,
            file_name=None,
        )

    return WhatsAppIncoming(phone=phone, message_type="text", body=form.get("Body", ""))


async def _handle(incoming: WhatsAppIncoming) -> None:
    try:
        reply = await session_manager.handle_incoming(incoming)
        log_preview = reply[:100] if isinstance(reply, str) else str(reply)[:100]
        logger.info("Sending reply to %s: %s", incoming.phone, log_preview)
        result = await whatsapp_sender.send_response(incoming.phone, reply)
        logger.info("Twilio WhatsApp send result: %s", result)
    except Exception as exc:  # noqa: BLE001 - background task; log, never raise
        logger.error("Twilio webhook processing error: %s", exc, exc_info=True)


@router.post("")
async def receive_message(request: Request, background_tasks: BackgroundTasks) -> Response:
    form = await request.form()
    params = {key: str(value) for key, value in form.items()}

    if not _signature_ok(request, params):
        logger.warning("Rejected Twilio webhook with a bad or missing signature")
        raise HTTPException(status_code=403)

    message_sid = params.get("MessageSid") or params.get("SmsMessageSid")
    if _mark_message_seen(message_sid):
        logger.info("Ignoring duplicate Twilio inbound message: %s", message_sid)
    elif params.get("From"):
        incoming = incoming_from_form(params)
        logger.info("Twilio WhatsApp message from %s, type %s", incoming.phone, incoming.message_type)
        background_tasks.add_task(_handle, incoming)

    return Response(content=_EMPTY_TWIML, media_type="application/xml")
