from urllib.parse import parse_qs, urlparse
from unittest.mock import patch

from gov_agent.qr_login import get_login_url


def test_dashboard_login_url_uses_one_time_handoff_code():
    with patch("gov_agent.qr_login.create_login_handoff", return_value="handoff-123"):
        url = get_login_url("919632363213")

    parsed = urlparse(url)
    params = parse_qs(parsed.query)
    assert params["handoff"] == ["handoff-123"]
    assert "phone" not in params
    assert "token" not in params
    assert "next" not in params
