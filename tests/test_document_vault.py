import unittest
from unittest.mock import patch

from gov_agent.document_vault import (
    DocumentVaultError,
    _materialize_document,
    _record_status,
    build_document_updates_from_profile,
    build_profile_updates,
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
