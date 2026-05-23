import io
import base64
import jwt
from urllib.parse import quote
from datetime import datetime, timezone, timedelta
from gov_agent.config import SECRET_KEY, FRONTEND_URL


def _sanitize_next_path(next_path: str | None) -> str:
    if not next_path or not next_path.startswith("/") or next_path.startswith("//"):
        return "/dashboard"
    return next_path


def _dashboard_next_path(phone: str, next_path: str | None) -> str:
    safe_path = _sanitize_next_path(next_path)
    if safe_path == "/dashboard":
        return f"/dashboard?phone={quote(str(phone), safe='')}"
    return safe_path


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
    token = jwt.encode(
        {"phone": phone, "exp": datetime.now(timezone.utc) + timedelta(hours=2)},
        SECRET_KEY,
        algorithm="HS256",
    )
    safe_next_path = quote(_dashboard_next_path(phone, next_path), safe="")
    return f"{FRONTEND_URL}/login?token={token}&phone={phone}&next={safe_next_path}"
