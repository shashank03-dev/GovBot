from pathlib import Path


def test_external_http_clients_have_explicit_default_timeouts():
    root = Path(__file__).resolve().parents[1]
    portal_agent = (root / "gov_agent" / "portal_agent.py").read_text()
    credentials_router = (root / "gov_agent" / "credentials_router.py").read_text()

    assert "httpx.AsyncClient(timeout=30.0)" in portal_agent
    assert "httpx.AsyncClient(timeout=30.0)" in credentials_router
