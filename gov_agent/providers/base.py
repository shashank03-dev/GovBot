from __future__ import annotations

from dataclasses import dataclass

import httpx


@dataclass(frozen=True)
class ProviderConfig:
    name: str
    provider: str
    model: str
    api_key: str
    enabled: bool = True
    weight: int = 1


class ProviderCallError(RuntimeError):
    def __init__(self, message: str, *, kind: str = "unexpected"):
        super().__init__(message)
        self.kind = kind


def classify_provider_error(exc: Exception) -> ProviderCallError:
    if isinstance(exc, ProviderCallError):
        return exc
    if isinstance(exc, httpx.TimeoutException):
        return ProviderCallError(str(exc) or "Request timed out", kind="timeout")
    if isinstance(exc, httpx.HTTPStatusError):
        status_code = exc.response.status_code
        if status_code == 429:
            return ProviderCallError(str(exc), kind="rate_limited")
        if status_code >= 500:
            return ProviderCallError(str(exc), kind="provider_unavailable")
        return ProviderCallError(str(exc), kind="unexpected")

    message = str(exc).lower()
    if "429" in message or "resource_exhausted" in message or "rate limit" in message:
        return ProviderCallError(str(exc), kind="rate_limited")
    return ProviderCallError(str(exc), kind="unexpected")
