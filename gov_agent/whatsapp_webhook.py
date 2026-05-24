import logging
from logging.handlers import RotatingFileHandler
import time
from fastapi import APIRouter, Request, Query, HTTPException
from fastapi.responses import PlainTextResponse, JSONResponse

from gov_agent.config import WHATSAPP_VERIFY_TOKEN
from gov_agent import whatsapp_sender
from gov_agent import session_manager
from gov_agent.models import WhatsAppIncoming

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)
file_handler = RotatingFileHandler('/tmp/webhook.log', maxBytes=1024*1024, backupCount=1)
file_handler.setFormatter(logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s'))
logger.addHandler(file_handler)

router = APIRouter()
_RECENT_MESSAGE_IDS: dict[str, float] = {}
_RECENT_MESSAGE_TTL_SECONDS = 15 * 60
_RECENT_MESSAGE_MAX = 2048


def _prune_recent_message_ids(now: float) -> None:
    stale_ids = [
        message_id
        for message_id, seen_at in _RECENT_MESSAGE_IDS.items()
        if (now - seen_at) > _RECENT_MESSAGE_TTL_SECONDS
    ]
    for message_id in stale_ids:
        _RECENT_MESSAGE_IDS.pop(message_id, None)
    if len(_RECENT_MESSAGE_IDS) <= _RECENT_MESSAGE_MAX:
        return
    newest = sorted(_RECENT_MESSAGE_IDS.items(), key=lambda item: item[1], reverse=True)[:_RECENT_MESSAGE_MAX]
    _RECENT_MESSAGE_IDS.clear()
    _RECENT_MESSAGE_IDS.update(newest)


def _mark_message_seen(message_id: str | None) -> bool:
    if not message_id:
        return False
    now = time.monotonic()
    _prune_recent_message_ids(now)
    if message_id in _RECENT_MESSAGE_IDS:
        return True
    _RECENT_MESSAGE_IDS[message_id] = now
    return False


def reset_recent_message_ids_for_tests() -> None:
    _RECENT_MESSAGE_IDS.clear()


@router.get("")
async def verify_webhook(
    request: Request,
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge")
):
    logger.info(f"Received GET request: {request.url}")
    logger.info(f"Headers: {request.headers}")
    if hub_verify_token == WHATSAPP_VERIFY_TOKEN:
        logger.info(f"Tokens match, returning {hub_challenge}")
        return int(hub_challenge) if hub_challenge and hub_challenge.isdigit() else PlainTextResponse(hub_challenge)
    logger.warning("Tokens did not match!")
    raise HTTPException(status_code=403)


@router.post("")
async def receive_message(request: Request):
    try:
        payload = await request.json()
        value = payload["entry"][0]["changes"][0]["value"]
        if "statuses" in value:
            logger.info("Received WhatsApp status update: %s", value["statuses"][0])
            return JSONResponse({"status": "ok"}, status_code=200)
        if "messages" not in value:
            return JSONResponse({"status": "ok"}, status_code=200)
        messages = value["messages"]
        message = messages[0]
        message_id = message.get("id")
        if _mark_message_seen(message_id):
            logger.info("Ignoring duplicate WhatsApp inbound message: %s", message_id)
            return JSONResponse({"status": "ok"}, status_code=200)

        phone = message["from"]
        msg_type = message["type"]

        media_id = None
        message_text = None

        mime_type = None
        file_name = None

        if msg_type == "text":
            message_text = message["text"]["body"]
        elif msg_type == "image":
            media_id = message.get("image", {}).get("id")
            mime_type = message.get("image", {}).get("mime_type")
        elif msg_type == "document":
            media_id = message.get("document", {}).get("id")
            mime_type = message.get("document", {}).get("mime_type")
            file_name = message.get("document", {}).get("filename")

        incoming = WhatsAppIncoming(
            phone=phone,
            message_type=msg_type if msg_type in ("text", "image", "document") else "text",
            body=message_text,
            media_id=media_id,
            mime_type=mime_type,
            file_name=file_name,
        )

        reply = await session_manager.handle_incoming(incoming)
        log_preview = reply[:100] if isinstance(reply, str) else str(reply)[:100]
        logger.info(f"Sending reply to {phone}: {log_preview}")
        result = await whatsapp_sender.send_response(phone, reply)
        logger.info(f"WhatsApp send result: {result}")

    except Exception as e:
        logger.error(f"Webhook processing error: {e}", exc_info=True)

    return JSONResponse({"status": "ok"}, status_code=200)
