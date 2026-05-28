import asyncio
import base64
import unittest
from unittest.mock import ANY, MagicMock, patch

from gov_agent.document_vault import (
    DocumentVaultError,
    _materialize_document,
    _record_status,
    analyze_document_validity,
    build_document_updates_from_profile,
    build_profile_updates,
    extract_document_data,
    ingest_document,
    list_user_documents,
    mask_document_for_list,
    merge_extracted_data,
    format_sensitive_document_reply,
    create_signed_download_url,
    hash_passkey,
    validate_stored_passkey,
    validate_upload_payload,
    verify_passkey,
)


class PasskeyHashTests(unittest.TestCase):
    def test_hash_and_verify_passkey(self):
        digest = hash_passkey("1234")

        self.assertNotEqual(digest, "1234")
        self.assertTrue(verify_passkey("1234", digest))
        self.assertFalse(verify_passkey("4321", digest))

    def test_validate_stored_passkey_accepts_hashed_pin(self):
        digest = hash_passkey("1234")

        validate_stored_passkey("1234", stored_digest=digest)

    def test_validate_stored_passkey_rejects_wrong_pin(self):
        digest = hash_passkey("1234")

        with self.assertRaises(DocumentVaultError) as ctx:
            validate_stored_passkey("9999", stored_digest=digest)

        self.assertEqual(ctx.exception.code, "passkey_invalid")

    def test_validate_stored_passkey_requires_existing_pin_setup(self):
        with self.assertRaises(DocumentVaultError) as ctx:
            validate_stored_passkey("1234", stored_digest=None)

        self.assertEqual(ctx.exception.code, "passkey_not_set")


class ProfileMappingTests(unittest.TestCase):
    def test_build_profile_updates_for_pan(self):
        updates = build_profile_updates(
            "pan",
            {
                "pan_number": "ABCDE1234F",
                "full_name": "Asha Singh",
                "father_name": "Rakesh Singh",
                "dob": "1998-05-15",
            },
        )

        self.assertEqual(
            updates,
            {
                "pan_number": "ABCDE1234F",
                "full_name": "Asha Singh",
                "father_name": "Rakesh Singh",
                "dob": "1998-05-15",
            },
        )

    def test_build_profile_updates_for_aadhaar_masks_to_last4(self):
        updates = build_profile_updates(
            "aadhaar",
            {
                "aadhaar_number": "1234 5678 9012",
                "full_name": "Asha Singh",
                "dob": "1998-05-15",
                "gender": "Female",
                "address": "Bengaluru, Karnataka",
            },
        )

        self.assertEqual(updates["aadhaar_last4"], "9012")
        self.assertEqual(updates["full_name"], "Asha Singh")
        self.assertNotIn("aadhaar_number", updates)

    def test_build_profile_updates_for_scholarship_documents(self):
        self.assertEqual(
            build_profile_updates("income_cert", {"annual_income": "25000"}),
            {"income": 25000},
        )
        self.assertEqual(
            build_profile_updates("caste_cert", {"caste": "Scheduled Caste", "category": "SC"}),
            {"caste": "sc"},
        )
        self.assertEqual(
            build_profile_updates("marksheet", {"student_name": "Asha Singh", "percentage": "95.5"}),
            {"full_name": "Asha Singh", "marks_pct": 95.5},
        )

    def test_build_profile_updates_maps_karnataka_category_iiia_to_obc(self):
        updates = build_profile_updates(
            "caste_cert",
            {"caste": "Vokkaligaru", "category": "Category III A (Backward Classes)"},
        )

        self.assertEqual(updates, {"caste": "obc"})

    def test_build_document_updates_from_profile_targets_overlapping_vault_fields(self):
        updates = build_document_updates_from_profile(
            {
                "full_name": "Asha Singh",
                "dob": "1998-05-15",
                "gender": "Female",
                "address": "Bengaluru, Karnataka",
                "income": 25000,
                "caste": "sc",
                "marks_pct": 95.5,
            }
        )

        self.assertEqual(updates["aadhaar"]["full_name"], "Asha Singh")
        self.assertEqual(updates["aadhaar"]["dob"], "1998-05-15")
        self.assertEqual(updates["income_cert"]["annual_income"], 25000)
        self.assertEqual(updates["caste_cert"]["caste"], "SC")
        self.assertEqual(updates["caste_cert"]["category"], "Scheduled Caste")
        self.assertEqual(updates["marksheet"]["student_name"], "Asha Singh")
        self.assertEqual(updates["marksheet"]["percentage"], 95.5)


class SensitiveReplyTests(unittest.TestCase):
    def test_formats_pan_reply_from_document_record(self):
        text = format_sensitive_document_reply(
            "pan",
            {
                "doc_type": "pan",
                "extracted_data": {
                    "pan_number": "ABCDE1234F",
                    "full_name": "Asha Singh",
                    "father_name": "Rakesh Singh",
                    "dob": "1998-05-15",
                },
            },
            signed_url="https://example.com/pan",
        )

        self.assertIn("PAN Number: *ABXXXXXX4F*", text)
        self.assertIn("Full Name: Asha Singh", text)
        self.assertIn("View file: https://example.com/pan", text)

    def test_formats_aadhaar_reply_from_document_record(self):
        text = format_sensitive_document_reply(
            "aadhaar",
            {
                "doc_type": "aadhaar",
                "extracted_data": {
                    "aadhaar_number": "1234 5678 9012",
                    "full_name": "Asha Singh",
                    "dob": "1998-05-15",
                },
            },
            signed_url=None,
        )

        self.assertIn("Aadhaar Number: *XXXX XXXX 9012*", text)
        self.assertIn("Full Name: Asha Singh", text)
        self.assertNotIn("View file:", text)

    def test_formats_marksheet_reply_from_document_record(self):
        text = format_sensitive_document_reply(
            "marksheet",
            {
                "doc_type": "marksheet",
                "extracted_data": {
                    "student_name": "Asha Singh",
                    "roll_number": "2024-7788",
                    "percentage": "93.2",
                },
            },
            signed_url=None,
        )

        self.assertIn("Student Name: Asha Singh", text)
        self.assertIn("Roll Number: 2024-7788", text)

    def test_formats_custom_document_reply_from_saved_summary(self):
        text = format_sensitive_document_reply(
            "custom",
            {
                "doc_type": "custom",
                "custom_label": "Domicile Certificate",
                "extracted_data": {
                    "summary": "Confirms residence in Bengaluru Urban district.",
                    "document_type_hint": "Residence proof",
                    "reference_number": "DOM-2025-44",
                },
            },
            signed_url=None,
        )

        self.assertIn("Domicile Certificate", text)
        self.assertIn("Confirms residence in Bengaluru Urban district.", text)
        self.assertIn("Residence proof", text)


class DemoFallbackExtractionTests(unittest.TestCase):
    def test_extracts_2026_income_and_caste_certificate_fallback_values(self):
        with patch("gov_agent.document_vault.has_gemini_client", return_value=False):
            income, income_confidence, _ = extract_document_data(
                "income_cert",
                image_b64="demo",
                mime_type="image/jpeg",
            )
            caste, caste_confidence, _ = extract_document_data(
                "caste_cert",
                image_b64="demo",
                mime_type="image/jpeg",
            )

        self.assertEqual(income_confidence, 0.91)
        self.assertEqual(caste_confidence, 0.91)
        self.assertEqual(income["certificate_number"], "RD1218190096391")
        self.assertEqual(income["annual_income"], 98000)
        self.assertEqual(income["issue_date"], "2026-01-29")
        self.assertEqual(income["valid_until"], "2031-01-29")
        self.assertEqual(caste["certificate_number"], "RD1218190096391")
        self.assertEqual(caste["caste"], "Vokkaligaru")
        self.assertEqual(caste["category"], "Category III A (Backward Classes)")

    def test_extracts_2025_marksheet_fallback_values(self):
        with patch("gov_agent.document_vault.has_gemini_client", return_value=False):
            marksheet, confidence, _ = extract_document_data(
                "marksheet",
                image_b64="demo",
                mime_type="image/jpeg",
            )

        self.assertEqual(confidence, 0.91)
        self.assertEqual(marksheet["student_name"], "SHASHANK GOWDA T")
        self.assertEqual(marksheet["roll_number"], "20259115638")
        self.assertEqual(marksheet["year"], "2025")
        self.assertEqual(marksheet["percentage"], 95.5)
        self.assertEqual(marksheet["marks_obtained"], 573)
        self.assertEqual(marksheet["max_marks"], 600)

    def test_extracts_marksheet_from_mistral_ocr_when_gemini_is_unavailable(self):
        ocr_text = """
        Register No.: 20259115638
        Year: 2025
        Candidate's Name : SHASHANK GOWDA T
        Father's Name : THIMMARAJU T
        Mother's Name : ANUSOOYA
        Total Marks 600 573
        Class Obtained: DISTINCTION
        """

        with (
            patch("gov_agent.document_vault.has_gemini_client", return_value=False),
            patch("gov_agent.document_vault.has_mistral_ocr_client", return_value=True),
            patch("gov_agent.document_vault.extract_ocr_markdown", return_value=ocr_text) as ocr_mock,
        ):
            marksheet, confidence, raw_text = extract_document_data(
                "marksheet",
                image_b64="demo",
                mime_type="image/jpeg",
            )

        ocr_mock.assert_called_once()
        self.assertGreaterEqual(confidence, 0.8)
        self.assertEqual(raw_text, ocr_text)
        self.assertEqual(marksheet["student_name"], "SHASHANK GOWDA T")
        self.assertEqual(marksheet["roll_number"], "20259115638")
        self.assertEqual(marksheet["year"], "2025")
        self.assertEqual(marksheet["marks_obtained"], 573)
        self.assertEqual(marksheet["max_marks"], 600)
        self.assertEqual(marksheet["percentage"], 95.5)

    def test_extracts_income_certificate_from_mistral_ocr_after_gemini_failure(self):
        ocr_text = """
        INCOME AND CASTE CERTIFICATE
        Certificate No: RD1218190096391
        Certified that Kumar Shashank Gowda T belongs to caste Vokkaligaru of Category III A.
        His family annual income is Rs. 98000.
        This certificate is valid for fiveyear.
        Date: 29/01/2026
        """

        with (
            patch("gov_agent.document_vault.has_gemini_client", return_value=True),
            patch("gov_agent.document_vault.generate_text", side_effect=RuntimeError("429 RESOURCE_EXHAUSTED")),
            patch("gov_agent.document_vault.has_mistral_ocr_client", return_value=True),
            patch("gov_agent.document_vault.extract_ocr_markdown", return_value=ocr_text),
        ):
            income, confidence, raw_text = extract_document_data(
                "income_cert",
                image_b64="demo",
                mime_type="image/jpeg",
            )

        self.assertGreaterEqual(confidence, 0.8)
        self.assertEqual(raw_text, ocr_text)
        self.assertEqual(income["certificate_number"], "RD1218190096391")
        self.assertEqual(income["annual_income"], 98000)
        self.assertEqual(income["issue_date"], "2026-01-29")
        self.assertEqual(income["valid_until"], "2031-01-29")

    def test_validates_demo_non_aadhaar_documents_without_gemini(self):
        with patch("gov_agent.document_vault.has_gemini_client", return_value=False):
            income = analyze_document_validity("income_cert", "demo")
            caste = analyze_document_validity("caste_cert", "demo")
            marksheet = analyze_document_validity("marksheet", "demo")

        self.assertTrue(income["valid"])
        self.assertEqual(income["verification_status"], "valid")
        self.assertEqual(income["issue_date"], "29/01/2026")
        self.assertEqual(income["expiry_date"], "29/01/2031")
        self.assertTrue(caste["valid"])
        self.assertEqual(caste["verification_status"], "valid")
        self.assertTrue(marksheet["valid"])
        self.assertEqual(marksheet["verification_status"], "valid")

    def test_validates_aadhaar_without_spending_gemini_vision_call(self):
        with (
            patch("gov_agent.document_vault.has_gemini_client", return_value=True),
            patch("gov_agent.document_vault.generate_text") as generate_text_mock,
        ):
            result = analyze_document_validity("aadhaar", "demo")

        generate_text_mock.assert_not_called()
        self.assertTrue(result["valid"])
        self.assertEqual(result["verification_status"], "valid")

    def test_validates_from_extracted_dates_without_spending_gemini_vision_call(self):
        with (
            patch("gov_agent.document_vault.has_gemini_client", return_value=True),
            patch("gov_agent.document_vault.GEMINI_VISION_VALIDATION", False),
            patch("gov_agent.document_vault.generate_text") as generate_text_mock,
        ):
            result = analyze_document_validity(
                "income_cert",
                "demo",
                extracted_data={
                    "issue_date": "2026-01-29",
                    "valid_until": "2031-01-29",
                },
            )

        generate_text_mock.assert_not_called()
        self.assertTrue(result["valid"])
        self.assertEqual(result["issue_date"], "29/01/2026")
        self.assertEqual(result["expiry_date"], "29/01/2031")
        self.assertEqual(result["verification_status"], "valid")

    def test_validates_from_extracted_dates_even_when_vision_validation_is_enabled(self):
        with (
            patch("gov_agent.document_vault.has_gemini_client", return_value=True),
            patch("gov_agent.document_vault.GEMINI_VISION_VALIDATION", True),
            patch("gov_agent.document_vault.generate_text") as generate_text_mock,
        ):
            result = analyze_document_validity(
                "marksheet",
                "demo",
                extracted_data={
                    "student_name": "SHASHANK GOWDA T",
                    "issue_date": "2025-01-01",
                },
            )

        generate_text_mock.assert_not_called()
        self.assertTrue(result["valid"])
        self.assertEqual(result["issue_date"], "01/01/2025")
        self.assertEqual(result["verification_status"], "valid")

    def test_ingest_passes_extracted_values_to_document_validation(self):
        extracted_data = {
            "student_name": "SHASHANK GOWDA T",
            "roll_number": "20259115638",
            "percentage": 95.5,
            "issue_date": "2025-01-01",
        }
        validation = {
            "valid": True,
            "doc_type": "marksheet",
            "issue_date": "01/01/2025",
            "expiry_date": "31/12/2029",
            "flags": [],
            "message": "Document validated using extracted fields.",
            "verification_status": "valid",
        }
        supabase_mock = MagicMock()
        supabase_mock.table.return_value.insert.return_value.execute.return_value.data = [
            {
                "id": "doc-marksheet",
                "phone": "919999999999",
                "doc_type": "marksheet",
                "ocr_extracted_data": extracted_data,
                "user_corrected_data": {},
                "extracted_data": extracted_data,
            }
        ]

        with (
            patch("gov_agent.document_vault.supabase", supabase_mock),
            patch("gov_agent.document_vault._upload_file"),
            patch("gov_agent.document_vault.list_documents_by_type", return_value=[]),
            patch("gov_agent.document_vault.extract_document_data", return_value=(extracted_data, 0.98, "api")),
            patch("gov_agent.document_vault.analyze_document_validity", return_value=validation) as analyze_mock,
            patch("gov_agent.document_vault._persist_document_check_audit"),
            patch("gov_agent.document_vault._merge_profile_updates"),
        ):
            asyncio.run(
                ingest_document(
                    phone="919999999999",
                    doc_type="marksheet",
                    source="web",
                    image_b64=base64.b64encode(b"\xff\xd8\xffdemo").decode("ascii"),
                    mime_type="image/jpeg",
                    file_name="marksheet.jpg",
                )
            )

        analyze_mock.assert_called_once_with("marksheet", ANY, extracted_data=extracted_data)


class DownloadUrlHelperTests(unittest.TestCase):
    def test_create_signed_download_url_uses_storage_path(self):
        with patch("gov_agent.document_vault.supabase") as supabase_mock:
            storage = supabase_mock.storage.from_.return_value
            storage.create_signed_url.return_value = {"signedURL": "https://signed.example/download"}

            url = create_signed_download_url("9199/pan/current.pdf")

        self.assertEqual(url, "https://signed.example/download")
        storage.create_signed_url.assert_called_once()


class StatusLogicTests(unittest.TestCase):
    def test_aadhaar_with_high_confidence_is_not_failed_when_validation_flags_unreadable(self):
        status = _record_status(
            "aadhaar",
            0.91,
            {"flags": ["unreadable"], "verification_status": "unknown"},
        )

        self.assertEqual(status, "ready")


class EditMergeTests(unittest.TestCase):
    def test_merge_extracted_data_preserves_unknown_fields_and_trims_strings(self):
        merged = merge_extracted_data(
            {"full_name": "Old Name", "dob": "1998-05-15", "extra": "keep"},
            {"full_name": "  New Name  ", "dob": "", "gender": "Male"},
        )

        self.assertEqual(
            merged,
            {
                "full_name": "New Name",
                "dob": "",
                "extra": "keep",
                "gender": "Male",
            },
        )

    def test_materialize_document_keeps_ocr_and_user_corrections_separate(self):
        materialized = _materialize_document(
            {
                "doc_type": "pan",
                "ocr_extracted_data": {
                    "pan_number": "ABCDE1234F",
                    "full_name": "OCR Name",
                },
                "user_corrected_data": {
                    "full_name": "Corrected Name",
                },
                "extracted_data": {
                    "pan_number": "ABCDE1234F",
                    "full_name": "Corrected Name",
                },
            }
        )

        self.assertEqual(materialized["ocr_extracted_data"]["full_name"], "OCR Name")
        self.assertEqual(materialized["user_corrected_data"]["full_name"], "Corrected Name")
        self.assertEqual(materialized["extracted_data"]["full_name"], "Corrected Name")

    def test_materialize_document_recovers_stale_failed_status_when_extracted_dates_validate(self):
        materialized = _materialize_document(
            {
                "doc_type": "marksheet",
                "status": "failed",
                "verification_status": "unknown",
                "issue_date": None,
                "expiry_date": None,
                "status_reason": "Document could not be read.",
                "source_confidence": 0.98,
                "ocr_extracted_data": {
                    "student_name": "SHASHANK GOWDA T",
                    "roll_number": "20259115638",
                    "issue_date": "2025-01-01",
                },
                "user_corrected_data": {},
                "extracted_data": {
                    "student_name": "SHASHANK GOWDA T",
                    "roll_number": "20259115638",
                    "issue_date": "2025-01-01",
                },
            }
        )

        self.assertEqual(materialized["status"], "ready")
        self.assertEqual(materialized["verification_status"], "valid")
        self.assertEqual(materialized["issue_date"], "2025-01-01")
        self.assertEqual(materialized["expiry_date"], "2029-12-31")


class ListMaskingTests(unittest.TestCase):
    def test_mask_document_for_list_hides_sensitive_numbers(self):
        masked = mask_document_for_list(
            {
                "doc_type": "aadhaar",
                "extracted_data": {
                    "aadhaar_number": "6634 0835 5424",
                    "full_name": "Asha Singh",
                },
            }
        )

        self.assertEqual(masked["extracted_data"]["aadhaar_number"], "XXXX XXXX 5424")
        self.assertEqual(masked["extracted_data"]["full_name"], "Asha Singh")

    def test_list_user_documents_keeps_multiple_custom_documents(self):
        fake_rows = [
            {
                "id": "doc-custom-2",
                "phone": "919999999999",
                "doc_type": "custom",
                "custom_label": "Residence Proof",
                "created_at": "2026-05-24T10:00:00Z",
                "ocr_extracted_data": {"summary": "Residence proof"},
                "user_corrected_data": {},
                "extracted_data": {"summary": "Residence proof"},
                "source_confidence": 0.82,
            },
            {
                "id": "doc-custom-1",
                "phone": "919999999999",
                "doc_type": "custom",
                "custom_label": "Domicile Certificate",
                "created_at": "2026-05-24T09:00:00Z",
                "ocr_extracted_data": {"summary": "Domicile"},
                "user_corrected_data": {},
                "extracted_data": {"summary": "Domicile"},
                "source_confidence": 0.84,
            },
            {
                "id": "doc-pan-1",
                "phone": "919999999999",
                "doc_type": "pan",
                "created_at": "2026-05-24T08:00:00Z",
                "ocr_extracted_data": {"pan_number": "ABCDE1234F"},
                "user_corrected_data": {},
                "extracted_data": {"pan_number": "ABCDE1234F"},
                "source_confidence": 0.91,
            },
        ]

        with patch("gov_agent.document_vault.supabase") as supabase_mock:
            supabase_mock.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = fake_rows

            documents = list_user_documents("919999999999", masked=False)

        self.assertEqual([doc["id"] for doc in documents], ["doc-custom-2", "doc-custom-1", "doc-pan-1"])


class UploadValidationTests(unittest.TestCase):
    def test_validate_upload_payload_rejects_large_file(self):
        with self.assertRaises(DocumentVaultError) as ctx:
            validate_upload_payload(
                mime_type="image/jpeg",
                file_name="aadhaar.jpg",
                content=b"\xff\xd8\xff" + (b"x" * (8 * 1024 * 1024 + 1)),
            )

        self.assertEqual(ctx.exception.code, "upload")

    def test_validate_upload_payload_rejects_unsupported_type(self):
        with self.assertRaises(DocumentVaultError) as ctx:
            validate_upload_payload(
                mime_type="text/plain",
                file_name="notes.txt",
                content=b"hello",
            )

        self.assertEqual(ctx.exception.code, "upload")

    def test_validate_upload_payload_returns_detected_mime(self):
        detected = validate_upload_payload(
            mime_type="image/jpg",
            file_name="aadhaar.jpg",
            content=b"\xff\xd8\xff" + b"demo",
        )

        self.assertEqual(detected, "image/jpeg")

    def test_validate_upload_payload_rejects_declared_type_mismatch(self):
        with self.assertRaises(DocumentVaultError) as ctx:
            validate_upload_payload(
                mime_type="application/pdf",
                file_name="aadhaar.pdf",
                content=b"\xff\xd8\xff" + b"demo",
            )

        self.assertEqual(ctx.exception.code, "upload")


if __name__ == "__main__":
    unittest.main()
