import hmac
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from gov_agent import config

OFFICIAL_AUTH_SCOPE = "official_access"
OFFICIAL_AUTH_ROLE = "official"
OFFICIAL_TOKEN_TTL_HOURS = 12

_official_bearer = HTTPBearer(auto_error=False)


def official_credentials_configured() -> bool:
    return bool(config.OFFICIAL_USERNAME and config.OFFICIAL_PASSWORD)


def validate_official_credentials(username: str, password: str) -> None:
    if not official_credentials_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Official access is not configured",
        )

    normalized_username = str(username or "").strip()
    configured_username = str(config.OFFICIAL_USERNAME or "").strip()
    configured_password = str(config.OFFICIAL_PASSWORD or "")

    if not (
        hmac.compare_digest(normalized_username, configured_username)
        and hmac.compare_digest(str(password or ""), configured_password)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid official credentials",
        )


def issue_official_token(username: str) -> str:
    normalized_username = str(username or "").strip()
    expires_at = datetime.now(timezone.utc) + timedelta(hours=OFFICIAL_TOKEN_TTL_HOURS)
    payload = {
        "sub": normalized_username,
        "role": OFFICIAL_AUTH_ROLE,
        "scope": OFFICIAL_AUTH_SCOPE,
        "exp": expires_at,
    }
    return jwt.encode(payload, str(config.SECRET_KEY), algorithm="HS256")


def require_official_auth(
    credentials: HTTPAuthorizationCredentials | None = Depends(_official_bearer),
) -> dict[str, str]:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Official authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(credentials.credentials, str(config.SECRET_KEY), algorithms=["HS256"])
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Official authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    username = str(payload.get("sub") or "").strip()
    if (
        payload.get("role") != OFFICIAL_AUTH_ROLE
        or payload.get("scope") != OFFICIAL_AUTH_SCOPE
        or not username
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid official session",
        )

    configured_username = str(config.OFFICIAL_USERNAME or "").strip()
    if configured_username and not hmac.compare_digest(username, configured_username):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid official session",
        )

    return {"username": username, "role": OFFICIAL_AUTH_ROLE}
