import asyncio
import base64
import importlib
import pathlib
import tempfile
import time
import unittest
import uuid
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from gov_agent import whatsapp_bridge_router


def _build_client() -> TestClient:
    app = FastAPI()
    app.include_router(whatsapp_bridge_router.router)
    return TestClient(app)


class WhatsAppBridgeRouterTests(unittest.TestCase):
    def setUp(self) -> None:
        whatsapp_bridge_router.bridge_manager.reset_for_tests()

    def test_command_returns_503_when_extension_is_disconnected(self):
        client = _build_client()

        response = client.post("/whatsapp-bridge/command", json={"command": "ping"})

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"], "extension_unreachable")

    def test_upload_file_command_rejects_invalid_file_path(self):
        client = _build_client()

        response = client.post(
            "/whatsapp-bridge/command",
            json={"command": "upload_file", "path": "/etc/hosts"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "invalid_file_path")

    def test_upload_file_command_reads_allowed_file_and_sends_base64_payload(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            allowed_dir = pathlib.Path(tmpdir)
            file_path = allowed_dir / "doc.jpg"
            file_bytes = b"bridge-test"
            file_path.write_bytes(file_bytes)
            client = _build_client()

            with patch.object(
                whatsapp_bridge_router,
                "ALLOWED_UPLOAD_DIRECTORIES",
                [allowed_dir],
            ), patch.object(
                whatsapp_bridge_router.bridge_manager,
                "dispatch_command",
                new=AsyncMock(return_value={"ok": True}),
            ) as dispatch_mock:
                whatsapp_bridge_router.bridge_manager._last_poll_at = time.monotonic()
                response = client.post(
                    "/whatsapp-bridge/command",
                    json={"command": "upload_file", "path": str(file_path)},
                )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"ok": True})
        dispatch_mock.assert_awaited_once()
        dispatched = dispatch_mock.await_args.args[0]
        self.assertEqual(dispatched["command"], "upload_file")
        self.assertEqual(dispatched["payload"]["file_name"], "doc.jpg")
        self.assertEqual(dispatched["payload"]["file_path"], str(file_path))
        self.assertEqual(
            dispatched["payload"]["file_base64"],
            base64.b64encode(file_bytes).decode("ascii"),
        )

    def test_inspect_file_inputs_command_dispatches_without_payload(self):
        client = _build_client()

        with patch.object(
            whatsapp_bridge_router.bridge_manager,
            "dispatch_command",
            new=AsyncMock(return_value={"ok": True, "fileInputs": []}),
        ) as dispatch_mock:
            whatsapp_bridge_router.bridge_manager._last_poll_at = time.monotonic()
            response = client.post(
                "/whatsapp-bridge/command",
                json={"command": "inspect_file_inputs"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"ok": True, "fileInputs": []})
        dispatch_mock.assert_awaited_once()
        dispatched = dispatch_mock.await_args.args[0]
        self.assertEqual(dispatched["command"], "inspect_file_inputs")
        self.assertEqual(dispatched["payload"], {})

    def test_poll_returns_204_when_no_command_is_waiting(self):
        client = _build_client()

        response = client.get(f"/whatsapp-bridge/poll?client_id={uuid.uuid4().hex}")

        self.assertEqual(response.status_code, 204)


class WhatsAppBridgeManagerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.manager = whatsapp_bridge_router.WhatsAppBridgeManager()

    async def test_poll_round_trip_resolves_dispatched_command(self):
        dispatch_task = asyncio.create_task(
            self.manager.dispatch_command(
                {
                    "command": "ping",
                    "payload": {},
                    "timeout_seconds": 5,
                }
            )
        )

        await asyncio.sleep(0)
        polled = await self.manager.poll_command("client-1")
        self.assertIsNotNone(polled)
        self.assertEqual(polled["command"], "ping")

        await self.manager.submit_response(
            {
                "id": polled["id"],
                "ok": True,
                "payload": {"ok": True, "title": "WhatsApp"},
            }
        )
        result = await dispatch_task

        self.assertEqual(result, {"ok": True, "title": "WhatsApp"})


class CorsConfigTests(unittest.TestCase):
    def test_default_cors_origins_include_whatsapp_web_for_bridge(self):
        import gov_agent.main as main

        main = importlib.reload(main)

        self.assertIn("https://web.whatsapp.com", main._cors_origins)
