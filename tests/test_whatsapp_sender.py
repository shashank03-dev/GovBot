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


if __name__ == "__main__":
    unittest.main()
