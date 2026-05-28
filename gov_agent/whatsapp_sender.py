import asyncio
import logging
from logging.handlers import RotatingFileHandler
from typing import Any
import httpx
from gov_agent.config import (
    WHATSAPP_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_OTP_TEMPLATE_LANGUAGE,
    WHATSAPP_OTP_TEMPLATE_NAME,
)

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
_fh = RotatingFileHandler('/tmp/webhook.log', maxBytes=1024*1024, backupCount=1)
_fh.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
logger.addHandler(_fh)

_WA_MAX_RETRIES = 3
_WA_BACKOFF_BASE = 1  # seconds; attempt n waits backoff_base * 2^(n-1)


def _build_text_payload(to: str, body: str) -> dict:
    return {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to,
        "type": "text",
        "text": {"body": body},
    }


def _build_otp_template_payload(to: str, code: str) -> dict:
    return {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to,
        "type": "template",
        "template": {
            "name": WHATSAPP_OTP_TEMPLATE_NAME,
            "language": {"code": WHATSAPP_OTP_TEMPLATE_LANGUAGE},
            "components": [
                {
                    "type": "body",
                    "parameters": [
                        {"type": "text", "text": code},
                    ],
                }
            ],
        },
    }


def _redact_payload_for_log(value: Any) -> Any:
    if isinstance(value, dict):
        redacted = {}
        for key, item in value.items():
            if key in {"body", "text"} and isinstance(item, str):
                redacted[key] = "[REDACTED]"
            else:
                redacted[key] = _redact_payload_for_log(item)
        return redacted
    if isinstance(value, list):
        return [_redact_payload_for_log(item) for item in value]
    return value


def _build_media_payload(to: str, media: dict[str, Any]) -> dict[str, Any]:
    mime_type = str(media.get("mime_type") or "")
    link = str(media["link"])
    filename = str(media.get("filename") or "document")
    if mime_type.startswith("image/"):
        return {
            "messaging_product": "whatsapp",
            "recipient_type": "individual",
            "to": to,
            "type": "image",
            "image": {"link": link},
        }
    return {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to,
        "type": "document",
        "document": {"link": link, "filename": filename},
    }


async def _post_whatsapp_payload(payload: dict) -> dict:
    # Debug: Check if credentials are loaded
    logger.info(
        "WhatsApp API debug - TOKEN exists: %s, PHONE_ID exists: %s, PHONE_ID value: %s",
        bool(WHATSAPP_TOKEN), bool(WHATSAPP_PHONE_NUMBER_ID), WHATSAPP_PHONE_NUMBER_ID,
    )

    url = (
        f"https://graph.facebook.com/v18.0/{WHATSAPP_PHONE_NUMBER_ID}"
        f"/messages"
    )
    headers = {
        "Authorization": f"Bearer {WHATSAPP_TOKEN}",
        "Content-Type": "application/json",
    }

    logger.info(
        "WhatsApp API request - URL: %s, to: %s, type: %s, payload: %s",
        url, payload.get("to"), payload.get("type"), _redact_payload_for_log(payload),
    )

    last_error: str = "unknown error"
    async with httpx.AsyncClient(timeout=10.0) as client:
        for attempt in range(1, _WA_MAX_RETRIES + 1):
            try:
                response = await client.post(url, headers=headers, json=payload)
                logger.info("WhatsApp API response - status: %d, body: %s", response.status_code, response.text)
                if response.status_code == 200:
                    return {"ok": True}
                last_error = f"HTTP {response.status_code}: {response.text}"
                logger.warning(
                    "WhatsApp API error (attempt %d/%d): %s - to: %s",
                    attempt, _WA_MAX_RETRIES, last_error, payload.get("to"),
                )
            except Exception as exc:
                last_error = str(exc)
                logger.warning(
                    "WhatsApp send exception (attempt %d/%d): %s - to: %s",
                    attempt, _WA_MAX_RETRIES, last_error, payload.get("to"),
                )
            if attempt < _WA_MAX_RETRIES:
                await asyncio.sleep(_WA_BACKOFF_BASE * (2 ** (attempt - 1)))

    logger.error(
        "WhatsApp send failed after %d attempts to %s: %s",
        _WA_MAX_RETRIES, payload.get("to"), last_error,
    )
    return {"error": last_error}


async def _send_whatsapp(to: str, body: str) -> dict:
    return await _post_whatsapp_payload(_build_text_payload(to, body))


async def send_response(to: str, response: dict[str, Any] | str) -> bool:
    if isinstance(response, str):
        return await send_message(to, response)

    kind = str(response.get("kind") or "text")
    if kind == "text":
        return await send_message(to, str(response.get("text", "")))

    if kind == "document_media_with_details":
        media_result = await _post_whatsapp_payload(_build_media_payload(to, response["media"]))
        if not media_result.get("ok"):
            return False
        text_result = await _post_whatsapp_payload(_build_text_payload(to, str(response.get("text", ""))))
        return bool(text_result.get("ok"))

    return await send_message(to, str(response.get("text", "")))


async def send_message(to: str, body: str) -> bool:
    logger.info("Attempting to send message to %s via WhatsApp", to)
    result = await _send_whatsapp(to, body)
    if result.get("ok"):
        logger.info("WhatsApp message sent successfully to %s", to)
        return True
    logger.warning("WhatsApp failed for %s, falling back to SMS: %s", to, result.get("error"))
    from gov_agent import sms_sender
    logger.info("Attempting SMS fallback to %s", to)
    sms_result = await sms_sender.send_sms(to, body)
    logger.info("SMS result for %s: %s", to, sms_result)
    return sms_result.get("status") == "sent"


async def send_otp_message(to: str, code: str, validity_minutes: int = 10) -> bool:
    body = f"Your GovBot OTP is: {code}\nValid for {validity_minutes} minutes."

    if not WHATSAPP_OTP_TEMPLATE_NAME:
        logger.info(
            "WHATSAPP_OTP_TEMPLATE_NAME is not configured; sending OTP as a free-form WhatsApp "
            "message, which only works when the user already has an open conversation window."
        )
        return await send_message(to, body)

    logger.info(
        "Attempting OTP template message to %s using template %s",
        to, WHATSAPP_OTP_TEMPLATE_NAME,
    )
    result = await _post_whatsapp_payload(_build_otp_template_payload(to, code))
    if result.get("ok"):
        logger.info("WhatsApp OTP template sent successfully to %s", to)
        return True

    logger.warning(
        "WhatsApp OTP template failed for %s, falling back to SMS only: %s",
        to, result.get("error"),
    )
    from gov_agent import sms_sender

    sms_result = await sms_sender.send_sms(to, body)
    logger.info("SMS OTP fallback result for %s: %s", to, sms_result)
    return sms_result.get("status") == "sent"
