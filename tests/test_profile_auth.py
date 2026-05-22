import unittest

from jose import jwt

from gov_agent.auth_router import _normalize_phone
from gov_agent.config import SECRET_KEY
from gov_agent.profile_router import (
    _collect_vault_profile_updates,
    _merge_profile_fields,
    _optional_jwt,
)


class ProfileAuthTests(unittest.TestCase):
    def test_optional_jwt_reads_phone_claim_from_current_token_shape(self):
        token = jwt.encode({"phone": _normalize_phone("9876543210")}, str(SECRET_KEY), algorithm="HS256")

        class Creds:
            credentials = token

        resolved = _optional_jwt(Creds())
        self.assertEqual(resolved, "919876543210")


class ProfileVaultFillTests(unittest.TestCase):
    def test_collect_vault_profile_updates_prefers_latest_document_values(self):
        updates = _collect_vault_profile_updates(
            [
                {
                    "doc_type": "aadhaar",
                    "extracted_data": {
                        "full_name": "Asha Singh",
                        "dob": "1998-05-15",
                        "gender": "Female",
                        "address": "Bengaluru, Karnataka",
                        "aadhaar_number": "1234 5678 9012",
                    },
                },
                {
                    "doc_type": "pan",
                    "extracted_data": {
                        "full_name": "Asha Singh",
                        "father_name": "Rakesh Singh",
                        "dob": "1998-05-16",
                        "pan_number": "ABCDE1234F",
                    },
                },
            ]
        )

        self.assertEqual(
            updates,
            {
                "full_name": "Asha Singh",
                "dob": "1998-05-15",
                "gender": "Female",
                "address": "Bengaluru, Karnataka",
                "aadhaar_last4": "9012",
                "father_name": "Rakesh Singh",
            },
        )

    def test_merge_profile_fields_from_vault_overwrites_existing_mapped_values(self):
        merged = _merge_profile_fields(
            {
                "full_name": "Manual Name",
                "dob": "",
                "gender": None,
                "address": "Existing Address",
            },
            {
                "full_name": "Vault Name",
                "dob": "1998-05-15",
                "gender": "Female",
                "address": "Vault Address",
                "aadhaar_last4": "9012",
            },
        )

        self.assertEqual(
            merged,
            {
                "full_name": "Vault Name",
                "dob": "1998-05-15",
                "gender": "Female",
                "address": "Vault Address",
                "aadhaar_last4": "9012",
            },
        )


if __name__ == "__main__":
    unittest.main()
