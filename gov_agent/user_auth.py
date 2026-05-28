import re
from typing import Optional

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from gov_agent.config import SECRET_KEY

_bearer = HTTPBearer(auto_error=False)


def normalize_phone(phone: str | None) -> str:
    digits = re.sub(r"\D", "", str(phone or ""))
    if not digits:
        return ""
    if len(digits) == 10:
        return f"91{digits}"
    if len(digits) == 11 and digits.startswith("0"):
        return f"91{digits[1:]}"
    return digits


def optional_jwt(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer),
) -> Optional[str]:
    if not creds:
        return None
    try:
        payload = jwt.decode(creds.credentials, str(SECRET_KEY), algorithms=["HS256"])
        resolved_phone = payload.get("phone") or payload.get("sub")
        normalized_phone = normalize_phone(resolved_phone)
        return normalized_phone or None
    except JWTError:
        return None


def require_authenticated_phone(token_phone: Optional[str]) -> str:
    if not token_phone:
        raise HTTPException(status_code=401, detail="Authentication required")
    return token_phone


def require_phone_access(phone: str, token_phone: Optional[str]) -> str:
    resolved_phone = require_authenticated_phone(token_phone)
    normalized_phone = normalize_phone(phone)
    if resolved_phone != normalized_phone:
        raise HTTPException(status_code=403, detail="Access denied")
    return resolved_phone
