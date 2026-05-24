import unittest
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from gov_agent import whatsapp_webhook


def _build_client() -> TestClient:
    app = FastAPI()
    app.include_router(whatsapp_webhook.router, prefix="/webhook")
    return TestClient(app)


def _payload(message_id: str, body: str = "hello") -> dict:
    return {
        "entry": [
            {
                "changes": [
                    {
                        "value": {
                            "messages": [
                                {
                                    "id": message_id,
                                    "from": "919632363213",
                                    "type": "text",
                                    "text": {"body": body},
                                }
                            ]
                        }
                    }
                ]
            }
        ]
    }


class WhatsAppWebhookTests(unittest.TestCase):
    def setUp(self) -> None:
        if hasattr(whatsapp_webhook, "reset_recent_message_ids_for_tests"):
            whatsapp_webhook.reset_recent_message_ids_for_tests()

    def test_duplicate_wamid_is_ignored(self):
        client = _build_client()

        with (
            patch.object(
                whatsapp_webhook.session_manager,
                "handle_incoming",
                new=AsyncMock(return_value="ok"),
            ) as handle_incoming,
            patch.object(
                whatsapp_webhook.whatsapp_sender,
                "send_message",
                new=AsyncMock(return_value=True),
            ) as send_message,
        ):
            first = client.post("/webhook", json=_payload("wamid-1"))
            second = client.post("/webhook", json=_payload("wamid-1"))

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        handle_incoming.assert_awaited_once()
        send_message.assert_awaited_once_with("919632363213", "ok")

    def test_structured_response_uses_sender_dispatch(self):
        client = _build_client()
        structured = {
            "kind": "document_media_with_details",
            "media": {
                "link": "https://signed.example/doc.pdf",
                "mime_type": "application/pdf",
                "filename": "doc.pdf",
            },
            "text": "masked summary",
        }

        with (
            patch.object(
                whatsapp_webhook.session_manager,
                "handle_incoming",
                new=AsyncMock(return_value=structured),
            ) as handle_incoming,
            patch.object(
                whatsapp_webhook.whatsapp_sender,
                "send_response",
                new=AsyncMock(return_value=True),
            ) as send_response,
        ):
            response = client.post("/webhook", json=_payload("wamid-2"))

        self.assertEqual(response.status_code, 200)
        handle_incoming.assert_awaited_once()
        send_response.assert_awaited_once_with("919632363213", structured)


if __name__ == "__main__":
    unittest.main()
