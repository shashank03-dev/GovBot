import io
import base64
from urllib.parse import quote

from fastapi import HTTPException

from gov_agent.config import FRONTEND_URL
from gov_agent.web_session import _dashboard_next_path, create_login_handoff


def generate_login_qr(phone: str, next_path: str = "/dashboard") -> str:
    url = get_login_url(phone, next_path)

    try:
        import qrcode
        qr = qrcode.make(url)
        buf = io.BytesIO()
        qr.save(buf, format="PNG")
        buf.seek(0)
        return base64.b64encode(buf.read()).decode()
    except ImportError:
        return ""


def get_login_url(phone: str, next_path: str = "/dashboard") -> str:
    try:
        handoff_code = create_login_handoff(phone, next_path)
        return f"{FRONTEND_URL}/login?handoff={quote(handoff_code, safe='')}"
    except HTTPException:
        safe_next_path = quote(_dashboard_next_path(phone, next_path), safe="")
        return f"{FRONTEND_URL}/login?next={safe_next_path}"
