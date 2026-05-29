import io
import sys
import unittest
from unittest.mock import patch

from PIL import Image


class FakePdf:
    pages = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class FakePdfPage:
    def __init__(self, text):
        self.text = text

    def extract_text(self):
        return self.text


class LocalOcrTests(unittest.TestCase):
    def test_extracts_embedded_pdf_text_without_tesseract(self):
        from gov_agent.local_ocr import extract_local_ocr_text

        fake_pdf = FakePdf()
        fake_pdf.pages = [FakePdfPage("Name: Asha Singh\nDOB: 1998-05-15")]
        fake_pdfplumber = type("FakePdfplumber", (), {"open": staticmethod(lambda stream: fake_pdf)})

        with patch.dict(sys.modules, {"pdfplumber": fake_pdfplumber}):
            result = extract_local_ocr_text(b"%PDF-1.4 fake", "application/pdf")

        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result.engine, "pdfplumber")
        self.assertIn("Asha Singh", result.text)

    def test_extracts_image_text_with_local_tesseract_timeout(self):
        from gov_agent.local_ocr import extract_local_ocr_text

        image_bytes = io.BytesIO()
        Image.new("RGB", (220, 80), "white").save(image_bytes, format="PNG")
        captured = {}

        class FakePytesseract:
            @staticmethod
            def image_to_string(image, *, lang, config, timeout):
                captured["size"] = image.size
                captured["lang"] = lang
                captured["config"] = config
                captured["timeout"] = timeout
                return "Name: Asha Singh\n1234 5678 9012"

        with patch.dict(sys.modules, {"pytesseract": FakePytesseract}):
            result = extract_local_ocr_text(image_bytes.getvalue(), "image/png", timeout_seconds=2.5)

        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result.engine, "tesseract")
        self.assertEqual(captured["timeout"], 2.5)
        self.assertIn("--psm 6", captured["config"])
        self.assertIn("1234 5678 9012", result.text)


if __name__ == "__main__":
    unittest.main()
