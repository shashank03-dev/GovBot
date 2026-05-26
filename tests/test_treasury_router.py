import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from gov_agent import auth_router, treasury_router
from gov_agent.official_auth import issue_official_token


@pytest.fixture
def app(monkeypatch: pytest.MonkeyPatch) -> FastAPI:
    monkeypatch.setattr("gov_agent.config.OFFICIAL_USERNAME", "district-ops")
    monkeypatch.setattr("gov_agent.config.OFFICIAL_PASSWORD", "let-me-in")

    app = FastAPI()
    app.include_router(auth_router.router, prefix="/auth")
    app.include_router(treasury_router.router, prefix="/api")
    return app


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    return TestClient(app)


@pytest.fixture
def official_headers() -> dict[str, str]:
    token = issue_official_token("district-ops")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def ledger_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    ledger_path = tmp_path / "treasury-ledger.json"
    sanctions = [
        {
            "scheme": "nsp",
            "amount_inr": 120000,
            "sanction_tx_hash": "0xsanctionnsp",
            "sanctioned_at": "2026-05-26T10:00:00Z",
            "authority": "Central Treasury",
        },
        {
            "scheme": "ssp",
            "amount_inr": 90000,
            "sanction_tx_hash": "0xsanctionssp",
            "sanctioned_at": "2026-05-26T10:30:00Z",
            "authority": "Central Treasury",
        },
    ]
    ledger_path.write_text(json.dumps({"sanctions": sanctions, "releases": []}), encoding="utf-8")

    monkeypatch.setattr("gov_agent.config.TREASURY_LEDGER_FILE", str(ledger_path))
    monkeypatch.setattr("gov_agent.config.TREASURY_SANCTIONS_JSON", json.dumps(sanctions))
    monkeypatch.setattr("gov_agent.config.TREASURY_APPROVED_WALLET", "0xapprovedwallet")
    monkeypatch.setattr("gov_agent.config.TREASURY_EXPLORER_BASE_URL", "https://amoy.polygonscan.com/tx/")
    monkeypatch.setattr("gov_agent.config.TREASURY_RELEASE_ANCHOR_ADDRESS", "0xanchorwallet")
    monkeypatch.setattr("gov_agent.config.TREASURY_CHAIN_ID", 80002)
    monkeypatch.setattr("gov_agent.config.TREASURY_NETWORK_NAME", "Polygon Amoy")
    return ledger_path


def test_treasury_summary_returns_scheme_balances_for_authorized_official(
    client: TestClient,
    official_headers: dict[str, str],
    ledger_file: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setattr(
        "gov_agent.treasury_release._list_applications",
        lambda: [
            {
                "confirmation_number": "NSP2026A1",
                "phone": "919632363213",
                "portal": "nsp",
                "submitted_at": "2026-05-26T11:00:00Z",
                "status": "submitted",
            },
            {
                "confirmation_number": "SSP2026B1",
                "phone": "919632363214",
                "portal": "ssp",
                "submitted_at": "2026-05-26T11:30:00Z",
                "status": "submitted",
            },
        ],
    )
    monkeypatch.setattr("gov_agent.treasury_release._verified_phones", lambda: {"919632363213"})

    response = client.get("/api/treasury/summary", headers=official_headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["wallet"]["chain_id"] == 80002
    nsp = next(item for item in payload["schemes"] if item["scheme"] == "nsp")
    assert nsp["sanctioned_amount_inr"] == 120000
    assert nsp["ready_beneficiary_count"] == 1
    assert nsp["blocked_beneficiary_count"] == 0


def test_release_rejects_unapproved_wallet(
    client: TestClient,
    official_headers: dict[str, str],
    ledger_file: Path,
):
    response = client.post(
        "/api/treasury/release",
        headers=official_headers,
        json={
            "scheme": "nsp",
            "tx_hash": "0xreleasehash",
            "wallet_address": "0xnotapproved",
        },
    )

    assert response.status_code == 403


def test_public_transparency_feed_returns_release_rows_without_auth(
    client: TestClient,
    ledger_file: Path,
):
    ledger_file.write_text(
        json.dumps(
            {
                "sanctions": [
                    {
                        "scheme": "nsp",
                        "amount_inr": 120000,
                        "sanction_tx_hash": "0xsanctionnsp",
                        "sanctioned_at": "2026-05-26T10:00:00Z",
                        "authority": "Central Treasury",
                    }
                ],
                "releases": [
                    {
                        "release_id": "rel-1",
                        "scheme": "nsp",
                        "amount_inr": 25000,
                        "beneficiary_count": 1,
                        "ready_count": 0,
                        "blocked_count": 1,
                        "tx_hash": "0xreleasehash",
                        "wallet_address": "0xapprovedwallet",
                        "released_at": "2026-05-26T12:00:00Z",
                        "official_username": "district-ops",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    response = client.get("/api/treasury/releases/public")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["releases"]) == 1
    assert payload["releases"][0]["tx_hash"] == "0xreleasehash"


def test_beneficiary_status_flags_bank_verification_when_release_exists(
    client: TestClient,
    ledger_file: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    ledger_file.write_text(
        json.dumps(
            {
                "sanctions": [
                    {
                        "scheme": "nsp",
                        "amount_inr": 120000,
                        "sanction_tx_hash": "0xsanctionnsp",
                        "sanctioned_at": "2026-05-26T10:00:00Z",
                        "authority": "Central Treasury",
                    }
                ],
                "releases": [
                    {
                        "release_id": "rel-1",
                        "scheme": "nsp",
                        "amount_inr": 25000,
                        "beneficiary_count": 1,
                        "ready_count": 0,
                        "blocked_count": 1,
                        "tx_hash": "0xreleasehash",
                        "wallet_address": "0xapprovedwallet",
                        "released_at": "2026-05-26T12:00:00Z",
                        "official_username": "district-ops",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(
        "gov_agent.treasury_release._list_applications",
        lambda: [
            {
                "confirmation_number": "NSP2026A1",
                "phone": "919632363213",
                "portal": "nsp",
                "submitted_at": "2026-05-26T11:00:00Z",
                "status": "submitted",
            }
        ],
    )
    monkeypatch.setattr("gov_agent.treasury_release._verified_phones", lambda: set())

    response = client.get("/api/treasury/beneficiary/919632363213")

    assert response.status_code == 200
    payload = response.json()
    assert payload["release_authorized"] is True
    assert payload["action_required"] == "verify_bank"
    assert payload["release_tx_hash"] == "0xreleasehash"
