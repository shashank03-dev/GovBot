import unittest
from unittest.mock import AsyncMock, patch

from gov_agent import pm_kisan_agent


class PMKisanAgentTests(unittest.IsolatedAsyncioTestCase):
    async def test_pm_kisan_uses_text_router_when_available(self):
        with patch.object(
            pm_kisan_agent,
            "generate_text_reply",
            new=AsyncMock(return_value="router reply"),
        ):
            result = await pm_kisan_agent.check_pm_kisan_status("12345678901")

        self.assertEqual(result["message"], "router reply")

    async def test_pm_kisan_returns_static_fallback_when_router_fails(self):
        with patch.object(
            pm_kisan_agent,
            "generate_text_reply",
            new=AsyncMock(side_effect=RuntimeError("boom")),
        ):
            result = await pm_kisan_agent.check_pm_kisan_status("12345678901")

        self.assertIn("PM-KISAN Status Check", result["message"])
