import logging
from datetime import datetime

from gov_agent.db import supabase
from gov_agent import flow_router
from gov_agent.models import WhatsAppIncoming

logger = logging.getLogger(__name__)


def _detect_language_heuristic(text: str) -> str:
    """Detect language by Unicode script ranges without an API call."""
    for ch in text:
        cp = ord(ch)
        if 0x0900 <= cp <= 0x097F:  # Devanagari (Hindi/Marathi)
            return "hi"
        if 0x0C80 <= cp <= 0x0CFF:  # Kannada
            return "kn"
        if 0x0B80 <= cp <= 0x0BFF:  # Tamil
            return "ta"
        if 0x0C00 <= cp <= 0x0C7F:  # Telugu
            return "te"
    return "en"


async def detect_language(text: str) -> str:
    # Fast heuristic first — no quota consumed.
    # If it identifies a non-Latin script we trust it immediately.
    heuristic = _detect_language_heuristic(text)
    if heuristic != "en":
        return heuristic
    # Heuristic returned "en" (pure ASCII / Latin text).
    # Skip Gemini — calling the API for every English message wastes quota
    # and the model cannot reliably distinguish Romanised Hindi from English
    # without broader context.  Treat ASCII-only text as English.
    return "en"


async def get_session(phone: str) -> dict:
    try:
        response = supabase.table("sessions").select(
            "*").eq("phone", phone).limit(1).execute()
        if not response.data:
            new_row = {
                "phone": phone,
                "state": "greeting",
                "collected_data": {}
            }
            insert_response = supabase.table(
                "sessions").insert(new_row).execute()  # type: ignore
            return insert_response.data[0]  # type: ignore
        return response.data[0]  # type: ignore
    except Exception as e:
        logger.error(f"Supabase error in get_session for phone {phone}: {e}")
        raise


async def save_session(phone: str, state: str, collected_data: dict) -> None:
    try:
        update_data = {
            "phone": phone,
            "state": state,
            "collected_data": collected_data,
            "updated_at": datetime.now().isoformat()
        }
        supabase.table("sessions").upsert(
            update_data, on_conflict="phone").execute()  # type: ignore
    except Exception as e:
        logger.error(f"Supabase error in save_session for phone {phone}: {e}")
        raise


async def delete_session(phone: str) -> None:
    try:
        supabase.table("sessions").delete().eq("phone", phone).execute()
    except Exception as e:
        logger.warning(
            "Supabase delete failed for phone %s, resetting session instead: %s",
            phone,
            e,
        )
        supabase.table("sessions").upsert(
            {
                "phone": phone,
                "state": "greeting",
                "collected_data": {},
            },
            on_conflict="phone",
        ).execute()


async def handle_incoming(msg: WhatsAppIncoming) -> str:
    session = await get_session(msg.phone)
    data = session.get("collected_data", {})

    if not data.get("language") and msg.body:
        lang = await detect_language(msg.body)
        data["language"] = lang
        session["collected_data"] = data

    lang = data.get("language", "en")

    reply, new_state, new_data = await flow_router.route(session, msg)

    reply = await flow_router.translate_reply(reply, lang)

    if new_state == "__delete__":
        await delete_session(msg.phone)
    else:
        await save_session(msg.phone, new_state, new_data)

    return reply
