from urllib.parse import parse_qs, urlparse

from gov_agent.qr_login import get_login_url


def test_dashboard_login_url_carries_phone_in_next_path():
    url = get_login_url("919632363213")
    parsed = urlparse(url)
    params = parse_qs(parsed.query)

    assert params["phone"] == ["919632363213"]
    assert params["next"] == ["/dashboard?phone=919632363213"]
