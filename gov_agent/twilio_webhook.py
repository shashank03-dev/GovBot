"""Inbound WhatsApp messages from Twilio (WHATSAPP_PROVIDER=twilio).

Twilio posts each message as a form and we check the X-Twilio-Signature.

Replies (TWILIO_REPLY_MODE=twiml, the default) go back inside the webhook's
TwiML response, which trial accounts allow even though their REST API only
sends approved templates. Twilio waits 15 seconds, so if the bot takes longer
than TWILIO_TWIML_WAIT_SECONDS (OCR, a cold Gemini call) we return empty TwiML
and send the reply through the REST API once it's ready. With
TWILIO_REPLY_MODE=api every reply goes through the REST API in the background.
"""

from __future__ import annotations

import asyncio
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


def _send_when_done(phone: str, task: asyncio.Task) -> None:
    async def _send() -> None:
        try:
            reply = task.result()
        except Exception as exc:  # noqa: BLE001
            logger.error("Twilio webhook processing error: %s", exc, exc_info=exc)
            return
        logger.info("Reply for %s was slow; sending it through the Twilio API", phone)
        result = await whatsapp_sender.send_response(phone, reply)
        logger.info("Twilio WhatsApp send result: %s", result)

    asyncio.ensure_future(_send())


async def _reply_as_twiml(incoming: WhatsAppIncoming) -> str:
    task = asyncio.ensure_future(session_manager.handle_incoming(incoming))
    try:
        reply = await asyncio.wait_for(asyncio.shield(task), timeout=config.TWILIO_TWIML_WAIT_SECONDS)
    except asyncio.TimeoutError:
        task.add_done_callback(lambda done: _send_when_done(incoming.phone, done))
        return _EMPTY_TWIML
    except Exception as exc:  # noqa: BLE001 - always answer Twilio
        logger.error("Twilio webhook processing error: %s", exc, exc_info=True)
        return _EMPTY_TWIML

    log_preview = reply[:100] if isinstance(reply, str) else str(reply)[:100]
    logger.info("Replying to %s in TwiML: %s", incoming.phone, log_preview)
    try:
        return twilio_whatsapp.twiml_for_payloads(whatsapp_sender.payloads_for_response(incoming.phone, reply))
    except Exception as exc:  # noqa: BLE001
        logger.error("Could not build TwiML reply: %s", exc, exc_info=True)
        return _EMPTY_TWIML


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
        if config.TWILIO_REPLY_MODE == "api":
            background_tasks.add_task(_handle, incoming)
        else:
            return Response(content=await _reply_as_twiml(incoming), media_type="text/xml")

    return Response(content=_EMPTY_TWIML, media_type="text/xml")
