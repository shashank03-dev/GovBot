import unittest
from unittest.mock import patch

from gov_agent import mistral_ocr_client


class MistralOcrClientTests(unittest.TestCase):
    def test_extract_ocr_markdown_posts_base64_image_to_mistral(self):
        captured = {}

        class _Response:
            def raise_for_status(self):
                return None

            def json(self):
                return {"pages": [{"markdown": "Candidate's Name : SHASHANK GOWDA T"}]}

        def fake_post(url, *, headers, json, timeout):
            captured["url"] = url
            captured["headers"] = headers
            captured["json"] = json
            captured["timeout"] = timeout
            return _Response()

        with (
            patch.object(mistral_ocr_client, "MISTRAL_API_KEY", "mistral-key"),
            patch.object(mistral_ocr_client, "MISTRAL_OCR_MODEL", "mistral-ocr-latest"),
            patch.object(mistral_ocr_client.httpx, "post", side_effect=fake_post),
        ):
            markdown = mistral_ocr_client.extract_ocr_markdown(
                data_b64="abc123",
                mime_type="image/jpeg",
            )

        self.assertEqual(markdown, "Candidate's Name : SHASHANK GOWDA T")
        self.assertEqual(captured["url"], "https://api.mistral.ai/v1/ocr")
        self.assertEqual(captured["headers"]["Authorization"], "Bearer mistral-key")
        self.assertEqual(captured["json"]["model"], "mistral-ocr-latest")
        self.assertEqual(captured["json"]["document"]["type"], "image_url")
        self.assertEqual(captured["json"]["document"]["image_url"], "data:image/jpeg;base64,abc123")
        self.assertFalse(captured["json"]["include_image_base64"])

    def test_extract_ocr_markdown_combines_pages(self):
        class _Response:
            def raise_for_status(self):
                return None

            def json(self):
                return {
                    "pages": [
                        {"markdown": "first page"},
                        {"markdown": "second page"},
                    ]
                }

        with (
            patch.object(mistral_ocr_client, "MISTRAL_API_KEY", "mistral-key"),
            patch.object(mistral_ocr_client.httpx, "post", return_value=_Response()),
        ):
            markdown = mistral_ocr_client.extract_ocr_markdown(
                data_b64="abc123",
                mime_type="application/pdf",
            )

        self.assertEqual(markdown, "first page\n\nsecond page")


if __name__ == "__main__":
    unittest.main()
