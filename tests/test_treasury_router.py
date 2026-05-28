import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, Mock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from gov_agent import auth_router, treasury_release, treasury_router
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


def test_release_notifies_and_tracks_verified_and_unverified_applicants(
    client: TestClient,
    official_headers: dict[str, str],
    ledger_file: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    candidates = [
        {
            "confirmation_number": "NSP2026A1",
            "phone": "919632363213",
            "portal": "nsp",
            "submitted_at": "2026-05-26T11:00:00Z",
            "status": "submitted",
            "timeline_steps": [
                {"step": "Applied", "icon": "A", "date": "2026-05-26", "est_date": "2026-05-26", "done": True},
                {"step": "Under Review", "icon": "R", "date": None, "est_date": "2026-06-02", "done": False},
                {"step": "Approved", "icon": "V", "date": None, "est_date": "2026-06-09", "done": False},
                {"step": "Disbursed", "icon": "D", "date": None, "est_date": "2026-06-16", "done": False},
            ],
        },
        {
            "confirmation_number": "NSP2026B1",
            "phone": "919632363214",
            "portal": "nsp",
            "submitted_at": "2026-05-26T11:30:00Z",
            "status": "submitted",
            "timeline_steps": [],
        },
    ]
    monkeypatch.setattr("gov_agent.treasury_release._list_applications", lambda: candidates)
    monkeypatch.setattr("gov_agent.treasury_release._verified_phones", lambda: {"919632363213"})

    ensure_ready = Mock(return_value={"ready": True})
    mark_processing = Mock()
    activity_calls: list[tuple[str, str]] = []
    tracking_calls: list[tuple[str, bool]] = []
    notification = AsyncMock(return_value=True)

    monkeypatch.setattr(treasury_release, "ensure_disbursement_ready", ensure_ready)
    monkeypatch.setattr(treasury_release, "_mark_disbursement_processing", mark_processing)
    monkeypatch.setattr(
        treasury_release,
        "_record_activity",
        lambda phone, event: activity_calls.append((phone, event)),
    )
    monkeypatch.setattr(
        treasury_release,
        "_update_application_release_tracking",
        lambda row, release, bank_verified: tracking_calls.append(
            (str(row.get("confirmation_number")), bank_verified)
        ),
        raising=False,
    )
    monkeypatch.setattr(
        treasury_release,
        "_send_release_notification",
        notification,
        raising=False,
    )

    response = client.post(
        "/api/treasury/release",
        headers=official_headers,
        json={
            "scheme": "nsp",
            "tx_hash": "0xreleasehash",
            "wallet_address": "0xapprovedwallet",
        },
    )

    assert response.status_code == 200
    ensure_ready.assert_called_once_with("919632363213")
    mark_processing.assert_called_once_with("NSP2026A1")
    assert tracking_calls == [("NSP2026A1", True), ("NSP2026B1", False)]
    assert activity_calls == [
        ("919632363213", "🏛️ Scholarship funds released. Bank credit is now processing."),
        ("919632363214", "🏛️ Scholarship funds released. Verify your bank details now to receive payment."),
    ]
    assert notification.await_count == 2
    assert [call.kwargs["phone"] for call in notification.await_args_list] == [
        "919632363213",
        "919632363214",
    ]
    assert [call.kwargs["bank_verified"] for call in notification.await_args_list] == [True, False]


def test_release_timeline_for_verified_bank_marks_funds_released_before_disbursed():
    timeline = treasury_release._build_release_timeline(
        [
            {"step": "Applied", "icon": "A", "date": "2026-05-26", "est_date": "2026-05-26", "done": True},
            {"step": "Under Review", "icon": "R", "date": None, "est_date": "2026-06-02", "done": False},
            {"step": "Approved", "icon": "V", "date": None, "est_date": "2026-06-09", "done": False},
            {"step": "Disbursed", "icon": "D", "date": None, "est_date": "2026-06-16", "done": False},
        ],
        released_at="2026-05-28T06:45:00+00:00",
        bank_verified=True,
    )

    assert [item["step"] for item in timeline] == [
        "Applied",
        "Under Review",
        "Approved",
        "Funds Released",
        "Disbursed",
    ]
    assert [item["done"] for item in timeline] == [True, True, True, True, False]
    assert timeline[3]["date"] == "2026-05-28"


def test_release_timeline_for_unverified_bank_adds_bank_verification_blocker():
    timeline = treasury_release._build_release_timeline(
        [],
        released_at="2026-05-28T06:45:00+00:00",
        bank_verified=False,
    )

    assert [item["step"] for item in timeline] == [
        "Applied",
        "Under Review",
        "Approved",
        "Funds Released",
        "Bank Verification Needed",
        "Disbursed",
    ]
    assert [item["done"] for item in timeline] == [True, True, True, True, False, False]
    assert timeline[4]["icon"] == "B"


def test_application_release_tracking_sets_status_and_timeline_for_dashboard(
    monkeypatch: pytest.MonkeyPatch,
):
    application_table = MagicMock()
    application_table.update.return_value.eq.return_value.execute.return_value = None
    supabase_mock = MagicMock()
    supabase_mock.table.return_value = application_table
    monkeypatch.setattr(treasury_release, "supabase", supabase_mock)

    treasury_release._update_application_release_tracking(
        {
            "confirmation_number": "NSP2026A1",
            "timeline_steps": [
                {"step": "Applied", "icon": "A", "date": "2026-05-26", "est_date": "2026-05-26", "done": True},
            ],
        },
        {"released_at": "2026-05-28T06:45:00+00:00"},
        bank_verified=True,
    )

    payload = application_table.update.call_args.args[0]
    assert payload["status"] == "processing"
    assert "Funds Released" in [item["step"] for item in payload["timeline_steps"]]
    assert "Bank Verification Needed" not in [item["step"] for item in payload["timeline_steps"]]
    application_table.update.return_value.eq.assert_called_once_with("confirmation_number", "NSP2026A1")


def test_application_release_tracking_keeps_unverified_applicant_submitted(
    monkeypatch: pytest.MonkeyPatch,
):
    application_table = MagicMock()
    application_table.update.return_value.eq.return_value.execute.return_value = None
    supabase_mock = MagicMock()
    supabase_mock.table.return_value = application_table
    monkeypatch.setattr(treasury_release, "supabase", supabase_mock)

    treasury_release._update_application_release_tracking(
        {"confirmation_number": "NSP2026B1", "timeline_steps": []},
        {"released_at": "2026-05-28T06:45:00+00:00"},
        bank_verified=False,
    )

    payload = application_table.update.call_args.args[0]
    assert payload["status"] == "submitted"
    assert "Bank Verification Needed" in [item["step"] for item in payload["timeline_steps"]]


def test_release_continues_when_whatsapp_notification_fails(
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
                "timeline_steps": [],
            }
        ],
    )
    monkeypatch.setattr("gov_agent.treasury_release._verified_phones", lambda: {"919632363213"})

    tracking_calls: list[str] = []
    monkeypatch.setattr(treasury_release, "ensure_disbursement_ready", Mock(return_value={"ready": True}))
    monkeypatch.setattr(treasury_release, "_mark_disbursement_processing", Mock())
    monkeypatch.setattr(treasury_release, "_record_activity", lambda _phone, _event: None)
    monkeypatch.setattr(
        treasury_release,
        "_update_application_release_tracking",
        lambda row, _release, _bank_verified: tracking_calls.append(str(row.get("confirmation_number"))),
        raising=False,
    )
    monkeypatch.setattr(
        treasury_release,
        "_send_release_notification",
        AsyncMock(side_effect=RuntimeError("whatsapp unavailable")),
        raising=False,
    )

    response = client.post(
        "/api/treasury/release",
        headers=official_headers,
        json={
            "scheme": "nsp",
            "tx_hash": "0xreleasehash",
            "wallet_address": "0xapprovedwallet",
        },
    )

    assert response.status_code == 200
    assert tracking_calls == ["NSP2026A1"]
    ledger = json.loads(ledger_file.read_text(encoding="utf-8"))
    assert ledger["releases"][0]["tx_hash"] == "0xreleasehash"


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


def test_treasury_summary_handles_naive_application_timestamps_after_release(
    client: TestClient,
    official_headers: dict[str, str],
    ledger_file: Path,
    monkeypatch: pytest.MonkeyPatch,
):
    ledger_file.write_text(
        json.dumps(
            {
                "sanctions": [
                    {
                        "scheme": "nsp",
                        "amount_inr": 500000,
                        "sanction_tx_hash": "0xsanctionnsp",
                        "sanctioned_at": "2026-05-26T10:00:00Z",
                        "authority": "Central Treasury",
                    }
                ],
                "releases": [
                    {
                        "release_id": "rel-2",
                        "scheme": "nsp",
                        "amount_inr": 250000,
                        "beneficiary_count": 10,
                        "ready_count": 0,
                        "blocked_count": 10,
                        "tx_hash": "0xreleasehashnspdemo",
                        "wallet_address": "0xapprovedwallet",
                        "released_at": "2026-05-26T12:00:00+00:00",
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
                "submitted_at": "2026-05-26T11:00:00",
                "status": "submitted",
            }
        ],
    )
    monkeypatch.setattr("gov_agent.treasury_release._verified_phones", lambda: set())

    response = client.get("/api/treasury/summary", headers=official_headers)

    assert response.status_code == 200
    payload = response.json()
    nsp = next(item for item in payload["schemes"] if item["scheme"] == "nsp")
    assert nsp["pending_beneficiary_count"] == 0
