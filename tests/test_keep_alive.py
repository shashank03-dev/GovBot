import asyncio
import os
import unittest
from unittest.mock import patch

from gov_agent import keep_alive


class _FakeClient:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.urls = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def get(self, url):
        self.urls.append(url)
        outcome = self.outcomes.pop(0) if self.outcomes else 200
        if isinstance(outcome, Exception):
            raise outcome
        return type("Response", (), {"status_code": outcome})()


class KeepAliveTests(unittest.IsolatedAsyncioTestCase):
    def test_disabled_without_url(self):
        with patch.dict(os.environ, {"KEEP_ALIVE_URL": ""}):
            self.assertIsNone(keep_alive.keep_alive_settings())

    def test_interval_has_a_floor_and_default(self):
        with patch.dict(os.environ, {"KEEP_ALIVE_URL": "https://x/health", "KEEP_ALIVE_INTERVAL_SECONDS": "5"}):
            self.assertEqual(keep_alive.keep_alive_settings(), ("https://x/health", 60.0))
        with patch.dict(os.environ, {"KEEP_ALIVE_URL": "https://x/health", "KEEP_ALIVE_INTERVAL_SECONDS": "bad"}):
            self.assertEqual(keep_alive.keep_alive_settings()[1], 600.0)

    async def test_start_returns_none_when_disabled(self):
        with patch.dict(os.environ, {"KEEP_ALIVE_URL": ""}):
            self.assertIsNone(keep_alive.start_keep_alive())
        await keep_alive.stop_keep_alive(None)

    async def test_pings_repeatedly_and_survives_failures(self):
        fake = _FakeClient([RuntimeError("network down"), 503, 200, 200])
        with patch.object(keep_alive.httpx, "AsyncClient", return_value=fake):
            task = asyncio.create_task(keep_alive.ping_forever("https://x/health", 0.001))
            for _ in range(200):
                if len(fake.urls) >= 4:
                    break
                await asyncio.sleep(0.005)
            await keep_alive.stop_keep_alive(task)

        self.assertGreaterEqual(len(fake.urls), 4)
        self.assertTrue(task.done())

    async def test_lifespan_starts_and_stops_ping_task_when_enabled(self):
        from gov_agent import main

        with (
            patch.dict(os.environ, {"KEEP_ALIVE_URL": "https://x/health"}),
            patch("gov_agent.config.validate_config"),
            patch.object(keep_alive, "ping_forever", side_effect=lambda url, interval: asyncio.sleep(3600)),
        ):
            async with main.lifespan(main.app):
                running = [t for t in asyncio.all_tasks() if t.get_name() == "keep-alive"]
                self.assertEqual(len(running), 1)
            self.assertTrue(running[0].done())


if __name__ == "__main__":
    unittest.main()
