import unittest
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from twilio.request_validator import RequestValidator

from gov_agent import config, twilio_webhook, twilio_whatsapp, whatsapp_sender, whatsapp_webhook

AUTH_TOKEN = "test-auth-token"
WEBHOOK_URL = "https://govbot.example.com/govbot/twilio/webhook"
SANDBOX_FROM = "whatsapp:+14155238886"


class _Response:
    def __init__(self, status_code, text='{"sid": "SM1"}'):
        self.status_code = status_code
        self.text = text
        self.content = text.encode()
        self.headers = {"content-type": "image/png"}

    def json(self):
        import json

        return json.loads(self.text)

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(self.status_code)


class _FakeClient:
    def __init__(self, responses):
        self.responses = list(responses)
        self.posts = []
        self.gets = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, data=None, auth=None):
        self.posts.append((url, data, auth))
        return self.responses.pop(0) if self.responses else _Response(201)

    async def get(self, url, auth=None):
        self.gets.append((url, auth))
        return _Response(200, "PNGDATA")


def _twilio_settings():
    return patch.multiple(
        twilio_whatsapp,
        TWILIO_ACCOUNT_SID="AC123",
        TWILIO_AUTH_TOKEN=AUTH_TOKEN,
        TWILIO_WHATSAPP_FROM=SANDBOX_FROM,
    )


class AddressTests(unittest.TestCase):
    def test_inbound_address_maps_to_meta_style_phone(self):
        self.assertEqual(twilio_whatsapp.phone_from_address("whatsapp:+919632363213"), "919632363213")

    def test_phone_maps_to_whatsapp_address(self):
        self.assertEqual(twilio_whatsapp.address_for_phone("919632363213"), "whatsapp:+919632363213")
        self.assertEqual(twilio_whatsapp.address_for_phone("+91 96323 63213"), "whatsapp:+919632363213")

    def test_only_twilio_https_urls_count_as_media(self):
        self.assertTrue(twilio_whatsapp.is_twilio_media_url("https://api.twilio.com/2010-04-01/Accounts/AC1/Media/ME1"))
        self.assertFalse(twilio_whatsapp.is_twilio_media_url("https://api.twilio.com.evil.example/x"))
        self.assertFalse(twilio_whatsapp.is_twilio_media_url("http://api.twilio.com/x"))
        self.assertFalse(twilio_whatsapp.is_twilio_media_url("1234567890"))
        self.assertFalse(twilio_whatsapp.is_twilio_media_url(None))


class PayloadTranslationTests(unittest.TestCase):
    def test_text_payload(self):
        with _twilio_settings():
            messages = twilio_whatsapp.messages_for_payload(whatsapp_sender._build_text_payload("919632363213", "hi"))
        self.assertEqual(messages, [{"From": SANDBOX_FROM, "To": "whatsapp:+919632363213", "Body": "hi"}])

    def test_long_text_is_split_under_the_limit(self):
        body = "\n".join(f"line {i} " + "x" * 80 for i in range(60))
        with _twilio_settings():
            messages = twilio_whatsapp.messages_for_payload(whatsapp_sender._build_text_payload("91", body))
        self.assertGreater(len(messages), 1)
        self.assertTrue(all(len(m["Body"]) <= twilio_whatsapp.MAX_BODY_CHARS for m in messages))
        self.assertEqual("".join(m["Body"] for m in messages).replace("\n", ""), body.replace("\n", ""))

    def test_split_without_whitespace(self):
        chunks = twilio_whatsapp.split_body("a" * 3500)
        self.assertEqual([len(c) for c in chunks], [1600, 1600, 300])

    def test_media_payload_uses_link(self):
        payload = whatsapp_sender._build_media_payload(
            "91", {"link": "https://files.example/doc.pdf", "mime_type": "application/pdf", "filename": "a.pdf"}
        )
        with _twilio_settings():
            messages = twilio_whatsapp.messages_for_payload(payload)
        self.assertEqual(messages[0]["MediaUrl"], "https://files.example/doc.pdf")

    def test_otp_template_becomes_text(self):
        with _twilio_settings():
            messages = twilio_whatsapp.messages_for_payload(
                whatsapp_sender._build_otp_template_payload("91", "123456")
            )
        self.assertIn("123456", messages[0]["Body"])


class SendTests(unittest.IsolatedAsyncioTestCase):
    async def test_send_posts_to_twilio(self):
        fake = _FakeClient([_Response(201)])
        with _twilio_settings(), patch.object(twilio_whatsapp.httpx, "AsyncClient", return_value=fake):
            result = await twilio_whatsapp.send_payload(whatsapp_sender._build_text_payload("919632363213", "hi"))
        self.assertEqual(result, {"ok": True})
        url, data, auth = fake.posts[0]
        self.assertEqual(url, "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json")
        self.assertEqual(data["To"], "whatsapp:+919632363213")
        self.assertEqual(auth, ("AC123", AUTH_TOKEN))

    async def test_client_error_is_not_retried(self):
        fake = _FakeClient([_Response(400, '{"code": 63015, "message": "not joined"}')])
        with _twilio_settings(), patch.object(twilio_whatsapp.httpx, "AsyncClient", return_value=fake):
            result = await twilio_whatsapp.send_payload(whatsapp_sender._build_text_payload("91", "hi"))
        self.assertIn("63015", result["error"])
        self.assertEqual(len(fake.posts), 1)

    async def test_server_error_is_retried(self):
        fake = _FakeClient([_Response(503, "{}"), _Response(201)])
        with (
            _twilio_settings(),
            patch.object(twilio_whatsapp.httpx, "AsyncClient", return_value=fake),
            patch.object(twilio_whatsapp, "_BACKOFF_BASE_SECONDS", 0),
        ):
            result = await twilio_whatsapp.send_payload(whatsapp_sender._build_text_payload("91", "hi"))
        self.assertEqual(result, {"ok": True})
        self.assertEqual(len(fake.posts), 2)

    async def test_not_configured(self):
        with patch.object(twilio_whatsapp, "TWILIO_WHATSAPP_FROM", ""):
            result = await twilio_whatsapp.send_payload(whatsapp_sender._build_text_payload("91", "hi"))
        self.assertIn("not configured", result["error"])

    async def test_whatsapp_sender_routes_through_twilio_when_selected(self):
        send = AsyncMock(return_value={"ok": True})
        with (
            patch.object(whatsapp_sender, "WHATSAPP_PROVIDER", "twilio"),
            patch.object(whatsapp_sender.twilio_whatsapp, "send_payload", send),
        ):
            self.assertTrue(await whatsapp_sender.send_message("919632363213", "hello"))
            self.assertTrue(await whatsapp_sender.send_otp_message("919632363213", "123456"))
        self.assertEqual(send.await_count, 2)
        self.assertEqual(send.await_args_list[1].args[0]["type"], "text")

    async def test_download_media_rejects_other_hosts(self):
        with self.assertRaises(ValueError):
            await twilio_whatsapp.download_media("https://example.com/secret")

    async def test_document_vault_downloads_twilio_media(self):
        from gov_agent import document_vault

        fake = _FakeClient([])
        url = "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages/MM1/Media/ME1"
        with _twilio_settings(), patch.object(twilio_whatsapp.httpx, "AsyncClient", return_value=fake):
            content, mime, name = await document_vault.download_whatsapp_media(url)
        self.assertEqual((content, mime, name), (b"PNGDATA", "image/png", None))
        self.assertEqual(fake.gets, [(url, ("AC123", AUTH_TOKEN))])


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(twilio_webhook.router, prefix="/govbot/twilio/webhook")
    return TestClient(app)


def _signed(params: dict[str, str]) -> dict[str, str]:
    return {"X-Twilio-Signature": RequestValidator(AUTH_TOKEN).compute_signature(WEBHOOK_URL, params)}


class WebhookTests(unittest.TestCase):
    def setUp(self):
        whatsapp_webhook.reset_recent_message_ids_for_tests()
        self.settings = patch.multiple(
            config,
            TWILIO_AUTH_TOKEN=AUTH_TOKEN,
            TWILIO_WEBHOOK_URL=WEBHOOK_URL,
            TWILIO_VALIDATE_SIGNATURE=True,
            TWILIO_REPLY_MODE="api",
        )
        self.settings.start()
        self.addCleanup(self.settings.stop)

    def _post(self, params, headers=None):
        handle = AsyncMock(return_value="Welcome back!")
        send = AsyncMock(return_value=True)
        with (
            patch.object(twilio_webhook.session_manager, "handle_incoming", handle),
            patch.object(twilio_webhook.whatsapp_sender, "send_response", send),
        ):
            response = _client().post(
                "/govbot/twilio/webhook", data=params, headers=_signed(params) if headers is None else headers
            )
        return response, handle, send

    def test_text_message_is_handled_and_replied(self):
        params = {"MessageSid": "SM1", "From": "whatsapp:+919632363213", "Body": "hi", "NumMedia": "0"}
        response, handle, send = self._post(params)

        self.assertEqual(response.status_code, 200)
        self.assertIn("<Response>", response.text)
        incoming = handle.await_args.args[0]
        self.assertEqual((incoming.phone, incoming.message_type, incoming.body), ("919632363213", "text", "hi"))
        send.assert_awaited_once_with("919632363213", "Welcome back!")

    def test_image_message_passes_media_url_as_media_id(self):
        media_url = "https://api.twilio.com/2010-04-01/Accounts/AC1/Messages/MM1/Media/ME1"
        params = {
            "MessageSid": "MM1",
            "From": "whatsapp:+919632363213",
            "Body": "",
            "NumMedia": "1",
            "MediaUrl0": media_url,
            "MediaContentType0": "image/jpeg",
        }
        _, handle, _ = self._post(params)
        incoming = handle.await_args.args[0]
        self.assertEqual((incoming.message_type, incoming.media_id, incoming.mime_type), ("image", media_url, "image/jpeg"))

    def test_pdf_is_a_document(self):
        params = {
            "MessageSid": "MM2",
            "From": "whatsapp:+919632363213",
            "NumMedia": "1",
            "MediaUrl0": "https://api.twilio.com/x",
            "MediaContentType0": "application/pdf",
        }
        _, handle, _ = self._post(params)
        self.assertEqual(handle.await_args.args[0].message_type, "document")

    def test_bad_signature_is_rejected(self):
        params = {"MessageSid": "SM2", "From": "whatsapp:+919632363213", "Body": "hi"}
        response, handle, _ = self._post(params, headers={"X-Twilio-Signature": "forged"})
        self.assertEqual(response.status_code, 403)
        handle.assert_not_awaited()

    def test_signature_uses_forwarded_proto_when_no_url_configured(self):
        params = {"MessageSid": "SM3", "From": "whatsapp:+919632363213", "Body": "hi"}
        public_url = "https://testserver/govbot/twilio/webhook"
        signature = RequestValidator(AUTH_TOKEN).compute_signature(public_url, params)
        with patch.object(config, "TWILIO_WEBHOOK_URL", ""):
            response, handle, _ = self._post(
                params, headers={"X-Twilio-Signature": signature, "X-Forwarded-Proto": "https"}
            )
        self.assertEqual(response.status_code, 200)
        handle.assert_awaited_once()

    def test_duplicate_message_sid_is_ignored(self):
        params = {"MessageSid": "SM4", "From": "whatsapp:+919632363213", "Body": "hi"}
        self._post(params)
        _, handle, _ = self._post(params)
        handle.assert_not_awaited()


class TwimlReplyTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        whatsapp_webhook.reset_recent_message_ids_for_tests()

    def test_payloads_become_escaped_twiml_messages(self):
        payloads = whatsapp_sender.payloads_for_response(
            "91",
            {
                "kind": "document_media_with_details",
                "media": {"link": "https://files.example/a.pdf", "mime_type": "application/pdf"},
                "text": "Your <PAN> & details",
            },
        )
        with _twilio_settings():
            xml = twilio_whatsapp.twiml_for_payloads(payloads)
        self.assertIn("<Message><Media>https://files.example/a.pdf</Media></Message>", xml)
        self.assertIn("<Message>Your &lt;PAN&gt; &amp; details</Message>", xml)

    async def test_fast_reply_is_returned_inline(self):
        incoming = twilio_webhook.incoming_from_form({"From": "whatsapp:+919632363213", "Body": "hi"})
        send = AsyncMock(return_value=True)
        with (
            _twilio_settings(),
            patch.object(twilio_webhook.session_manager, "handle_incoming", AsyncMock(return_value="Welcome back!")),
            patch.object(twilio_webhook.whatsapp_sender, "send_response", send),
        ):
            xml = await twilio_webhook._reply_as_twiml(incoming)
        self.assertIn("<Message>Welcome back!</Message>", xml)
        send.assert_not_awaited()

    async def test_slow_reply_falls_back_to_the_api(self):
        import asyncio

        async def slow(_incoming):
            await asyncio.sleep(0.05)
            return "done"

        incoming = twilio_webhook.incoming_from_form({"From": "whatsapp:+919632363213", "Body": "hi"})
        send = AsyncMock(return_value=True)
        with (
            patch.object(config, "TWILIO_TWIML_WAIT_SECONDS", 0.01),
            patch.object(twilio_webhook.session_manager, "handle_incoming", slow),
            patch.object(twilio_webhook.whatsapp_sender, "send_response", send),
        ):
            xml = await twilio_webhook._reply_as_twiml(incoming)
            self.assertNotIn("<Message>", xml)
            for _ in range(100):
                if send.await_count:
                    break
                await asyncio.sleep(0.01)
        send.assert_awaited_once_with("919632363213", "done")

    def test_webhook_answers_with_twiml_by_default(self):
        params = {"MessageSid": "SM9", "From": "whatsapp:+919632363213", "Body": "hi"}
        with (
            _twilio_settings(),
            patch.multiple(config, TWILIO_AUTH_TOKEN=AUTH_TOKEN, TWILIO_WEBHOOK_URL=WEBHOOK_URL, TWILIO_REPLY_MODE="twiml"),
            patch.object(twilio_webhook.session_manager, "handle_incoming", AsyncMock(return_value="Hello")),
        ):
            response = _client().post("/govbot/twilio/webhook", data=params, headers=_signed(params))
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.headers["content-type"].startswith("text/xml"))
        self.assertIn("<Message>Hello</Message>", response.text)


class ConfigTests(unittest.TestCase):
    def test_twilio_provider_requires_twilio_credentials_not_meta(self):
        import importlib
        import os

        env = {
            "WHATSAPP_PROVIDER": "twilio",
            "WHATSAPP_TOKEN": "",
            "TWILIO_ACCOUNT_SID": "",
            "TWILIO_WHATSAPP_FROM": "+14155238886",
        }
        try:
            with patch.dict(os.environ, env):
                reloaded = importlib.reload(config)
                self.assertEqual(reloaded.TWILIO_WHATSAPP_FROM, SANDBOX_FROM)
                with self.assertRaises(ValueError) as ctx:
                    reloaded.validate_config()
        finally:
            importlib.reload(config)
        self.assertIn("TWILIO_ACCOUNT_SID", str(ctx.exception))
        self.assertNotIn("WHATSAPP_TOKEN", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
