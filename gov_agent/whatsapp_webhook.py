import logging
from logging.handlers import RotatingFileHandler
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
        logger.info(f"Sending reply to {phone}: {reply[:100]}")
        result = await whatsapp_sender.send_message(phone, reply)
        logger.info(f"WhatsApp send result: {result}")

    except Exception as e:
        logger.error(f"Webhook processing error: {e}", exc_info=True)

    return JSONResponse({"status": "ok"}, status_code=200)
