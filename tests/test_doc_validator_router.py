import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from gov_agent import doc_validator_router


def _build_client() -> TestClient:
    app = FastAPI()
    app.include_router(doc_validator_router.router, prefix="/documents")
    app.dependency_overrides[doc_validator_router._optional_jwt] = lambda: "919999999999"
    return TestClient(app)


class DocValidatorRouterTests(unittest.TestCase):
    def test_view_and_download_routes_require_passkey_and_return_distinct_keys(self):
        client = _build_client()

        with patch(
            "gov_agent.doc_validator_router.get_user_document",
            return_value={
                "id": "doc-pan-1",
                "phone": "919999999999",
                "storage_path": "9199/pan/current.pdf",
            },
        ), patch(
            "gov_agent.doc_validator_router.ensure_profile_passkey",
            return_value=None,
        ), patch(
            "gov_agent.doc_validator_router.create_signed_document_url",
            return_value="https://signed.example/view",
        ), patch(
            "gov_agent.doc_validator_router.create_signed_download_url",
            return_value="https://signed.example/download",
        ), patch(
            "gov_agent.doc_validator_router.log_document_access",
            return_value=None,
        ):
            view_res = client.post("/documents/item/doc-pan-1/view-url", headers={"X-Document-Passkey": "1234"})
            download_res = client.post("/documents/item/doc-pan-1/download-url", headers={"X-Document-Passkey": "1234"})

        self.assertEqual(view_res.status_code, 200)
        self.assertEqual(download_res.status_code, 200)
        self.assertEqual(view_res.json()["view_url"], "https://signed.example/view")
        self.assertEqual(download_res.json()["download_url"], "https://signed.example/download")

    def test_upload_route_accepts_custom_label_payload(self):
        client = _build_client()

        with patch(
            "gov_agent.doc_validator_router.ingest_document",
            return_value={"id": "doc-custom-1", "doc_type": "custom", "custom_label": "Domicile Certificate"},
        ) as ingest_mock:
            response = client.post(
                "/documents/upload",
                json={
                    "phone": "919999999999",
                    "doc_type": "custom",
                    "custom_label": "Domicile Certificate",
                    "source": "web",
                    "image_b64": "ZGVtbw==",
                    "file_name": "domicile.pdf",
                    "mime_type": "application/pdf",
                },
            )

        self.assertEqual(response.status_code, 200)
        ingest_mock.assert_called_once()
        self.assertEqual(ingest_mock.call_args.kwargs["custom_label"], "Domicile Certificate")


if __name__ == "__main__":
    unittest.main()
