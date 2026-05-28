from types import SimpleNamespace
from unittest.mock import MagicMock

from gov_agent import application_store


def test_save_latest_application_updates_existing_phone_portal_without_new_insert(monkeypatch):
    existing_query = MagicMock()
    existing_query.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = SimpleNamespace(
        data=[
            {
                "id": "app-existing",
                "phone": "919999999999",
                "portal": "nsp",
                "confirmation_number": "NSP2026EXISTING",
            }
        ]
    )

    update_query = MagicMock()
    update_query.update.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[
            {
                "id": "app-existing",
                "phone": "919999999999",
                "portal": "nsp",
                "confirmation_number": "NSP2026EXISTING",
                "status": "submitted",
            }
        ]
    )

    supabase_mock = MagicMock()
    supabase_mock.table.side_effect = [existing_query, update_query]
    monkeypatch.setattr(application_store, "supabase", supabase_mock)

    saved = application_store.save_latest_application(
        phone="919999999999",
        portal="nsp",
        service="NSP Scholarship",
        status="submitted",
        timeline_steps=[{"step": "Applied", "done": True}],
        confirmation_number_factory=lambda: "NSP2026NEW",
    )

    assert saved["confirmation_number"] == "NSP2026EXISTING"
    update_payload = update_query.update.call_args.args[0]
    assert update_payload["confirmation_number"] == "NSP2026EXISTING"
    assert update_payload["service"] == "NSP Scholarship"
    assert update_payload["portal"] == "nsp"
    existing_query.insert.assert_not_called()


def test_save_latest_application_inserts_when_phone_portal_has_no_existing_row(monkeypatch):
    existing_query = MagicMock()
    existing_query.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = SimpleNamespace(
        data=[]
    )

    insert_query = MagicMock()
    insert_query.insert.return_value.execute.return_value = SimpleNamespace(
        data=[
            {
                "phone": "919999999999",
                "portal": "ssp",
                "confirmation_number": "SSP2026NEW",
            }
        ]
    )

    supabase_mock = MagicMock()
    supabase_mock.table.side_effect = [existing_query, insert_query]
    monkeypatch.setattr(application_store, "supabase", supabase_mock)

    saved = application_store.save_latest_application(
        phone="919999999999",
        portal="ssp",
        service="SSP Scholarship",
        status="submitted",
        timeline_steps=[],
        confirmation_number_factory=lambda: "SSP2026NEW",
    )

    assert saved["confirmation_number"] == "SSP2026NEW"
    insert_payload = insert_query.insert.call_args.args[0]
    assert insert_payload["phone"] == "919999999999"
    assert insert_payload["portal"] == "ssp"
    assert insert_payload["confirmation_number"] == "SSP2026NEW"


def test_save_latest_application_recovers_from_concurrent_insert_conflict(monkeypatch):
    first_existing_query = MagicMock()
    first_existing_query.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = SimpleNamespace(
        data=[]
    )

    insert_query = MagicMock()
    insert_query.insert.return_value.execute.side_effect = RuntimeError("duplicate key value violates unique constraint")

    second_existing_query = MagicMock()
    second_existing_query.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value = SimpleNamespace(
        data=[
            {
                "id": "app-existing",
                "phone": "919999999999",
                "portal": "nsp",
                "confirmation_number": "NSP2026OTHER",
            }
        ]
    )

    update_query = MagicMock()
    update_query.update.return_value.eq.return_value.execute.return_value = SimpleNamespace(
        data=[{"id": "app-existing", "confirmation_number": "NSP2026OTHER"}]
    )

    supabase_mock = MagicMock()
    supabase_mock.table.side_effect = [first_existing_query, insert_query, second_existing_query, update_query]
    monkeypatch.setattr(application_store, "supabase", supabase_mock)

    saved = application_store.save_latest_application(
        phone="919999999999",
        portal="nsp",
        service="NSP Scholarship",
        status="submitted",
        timeline_steps=[],
        confirmation_number_factory=lambda: "NSP2026MINE",
    )

    assert saved["confirmation_number"] == "NSP2026OTHER"
    update_payload = update_query.update.call_args.args[0]
    assert update_payload["confirmation_number"] == "NSP2026OTHER"


def test_latest_applications_by_phone_portal_keeps_newest_row_per_scheme():
    rows = [
        {
            "id": "latest-nsp",
            "phone": "919999999999",
            "portal": "nsp",
            "confirmation_number": "NSP2026LATEST",
            "submitted_at": "2026-05-28T12:00:00+00:00",
        },
        {
            "id": "old-nsp",
            "phone": "919999999999",
            "portal": "nsp",
            "confirmation_number": "NSP2026OLD",
            "submitted_at": "2026-05-27T12:00:00+00:00",
        },
        {
            "id": "latest-ssp",
            "phone": "919999999999",
            "portal": "ssp",
            "confirmation_number": "SSP2026LATEST",
            "submitted_at": "2026-05-26T12:00:00+00:00",
        },
    ]

    deduped = application_store.latest_applications_by_phone_portal(rows)

    assert [row["confirmation_number"] for row in deduped] == ["NSP2026LATEST", "SSP2026LATEST"]
