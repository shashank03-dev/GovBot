from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from gov_agent.official_auth import require_official_auth
from gov_agent import treasury_release

router = APIRouter()


class ReleaseRequest(BaseModel):
    scheme: str
    tx_hash: str
    wallet_address: str


@router.get("/treasury/summary")
async def get_treasury_summary(official: dict[str, str] = Depends(require_official_auth)):
    return treasury_release.build_treasury_summary(official)


@router.post("/treasury/release")
async def create_treasury_release(
    body: ReleaseRequest,
    official: dict[str, str] = Depends(require_official_auth),
):
    return await treasury_release.record_release(
        official=official,
        tx_hash=body.tx_hash,
        wallet_address=body.wallet_address,
        scheme=body.scheme,
    )


@router.get("/treasury/releases/public")
async def get_public_release_feed():
    return treasury_release.build_public_release_feed()


@router.get("/treasury/beneficiary/{phone}")
async def get_beneficiary_release_status(phone: str):
    return treasury_release.get_beneficiary_release_status(phone)
