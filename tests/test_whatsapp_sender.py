import unittest
from unittest.mock import AsyncMock, patch

from gov_agent import whatsapp_sender


class SendOtpMessageTests(unittest.IsolatedAsyncioTestCase):
    async def test_uses_template_message_when_configured(self):
        with (
            patch.object(whatsapp_sender, "WHATSAPP_OTP_TEMPLATE_NAME", "govbot_login_otp"),
            patch.object(whatsapp_sender, "WHATSAPP_OTP_TEMPLATE_LANGUAGE", "en_US"),
            patch.object(
                whatsapp_sender,
                "_post_whatsapp_payload",
                new=AsyncMock(return_value={"ok": True}),
            ) as post_payload,
            patch.object(
                whatsapp_sender,
                "send_message",
                new=AsyncMock(return_value=True),
            ) as send_message,
        ):
            delivered = await whatsapp_sender.send_otp_message("919999999999", "123456")

        self.assertTrue(delivered)
        send_message.assert_not_awaited()
        post_payload.assert_awaited_once()

        payload = post_payload.await_args.args[0]
        self.assertEqual(payload["type"], "template")
        self.assertEqual(payload["to"], "919999999999")
        self.assertEqual(payload["template"]["name"], "govbot_login_otp")
        self.assertEqual(payload["template"]["language"]["code"], "en_US")
        self.assertEqual(
            payload["template"]["components"][0]["parameters"][0]["text"],
            "123456",
        )

    async def test_falls_back_to_freeform_when_template_not_configured(self):
        with (
            patch.object(whatsapp_sender, "WHATSAPP_OTP_TEMPLATE_NAME", ""),
            patch.object(
                whatsapp_sender,
                "send_message",
                new=AsyncMock(return_value=True),
            ) as send_message,
        ):
            delivered = await whatsapp_sender.send_otp_message("919999999999", "123456")

        self.assertTrue(delivered)
        send_message.assert_awaited_once_with(
            "919999999999",
            "Your GovBot OTP is: 123456\nValid for 10 minutes.",
        )


class SendResponseTests(unittest.IsolatedAsyncioTestCase):
    async def test_send_response_dispatches_document_media_then_text(self):
        response = {
            "kind": "document_media_with_details",
            "media": {
                "link": "https://signed.example/pan.pdf",
                "mime_type": "application/pdf",
                "filename": "pan-card.pdf",
            },
            "text": "PAN Number: *ABXXXXXX4F*",
        }

        with patch.object(
            whatsapp_sender,
            "_post_whatsapp_payload",
            new=AsyncMock(return_value={"ok": True}),
        ) as post_payload:
            delivered = await whatsapp_sender.send_response("919999999999", response)

        self.assertTrue(delivered)
        self.assertEqual(post_payload.await_count, 2)
        first_payload = post_payload.await_args_list[0].args[0]
        second_payload = post_payload.await_args_list[1].args[0]
        self.assertEqual(first_payload["type"], "document")
        self.assertEqual(first_payload["document"]["link"], "https://signed.example/pan.pdf")
        self.assertEqual(first_payload["document"]["filename"], "pan-card.pdf")
        self.assertEqual(second_payload["type"], "text")
        self.assertEqual(second_payload["text"]["body"], "PAN Number: *ABXXXXXX4F*")

    async def test_send_response_dispatches_image_media_then_text(self):
        response = {
            "kind": "document_media_with_details",
            "media": {
                "link": "https://signed.example/aadhaar.jpg",
                "mime_type": "image/jpeg",
                "filename": "aadhaar.jpg",
            },
            "text": "Aadhaar Number: *XXXX XXXX 9012*",
        }

        with patch.object(
            whatsapp_sender,
            "_post_whatsapp_payload",
            new=AsyncMock(return_value={"ok": True}),
        ) as post_payload:
            delivered = await whatsapp_sender.send_response("919999999999", response)

        self.assertTrue(delivered)
        image_payload = post_payload.await_args_list[0].args[0]
        self.assertEqual(image_payload["type"], "image")
        self.assertEqual(image_payload["image"]["link"], "https://signed.example/aadhaar.jpg")

    async def test_send_response_falls_back_to_text_for_plain_text_kind(self):
        with patch.object(
            whatsapp_sender,
            "send_message",
            new=AsyncMock(return_value=True),
        ) as send_message:
            delivered = await whatsapp_sender.send_response(
                "919999999999",
                {"kind": "text", "text": "hello"},
            )

        self.assertTrue(delivered)
        send_message.assert_awaited_once_with("919999999999", "hello")


if __name__ == "__main__":
    unittest.main()
