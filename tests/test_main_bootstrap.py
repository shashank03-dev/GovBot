import importlib
import unittest
from unittest.mock import AsyncMock, MagicMock, patch


class MainLifespanTests(unittest.IsolatedAsyncioTestCase):
    async def test_lifespan_only_validates_config(self):
        main = importlib.import_module("gov_agent.main")

        with (
            patch("gov_agent.config.validate_config") as validate_config_mock,
            patch("gov_agent.llm_text_router.initialize_text_router") as initialize_text_router_mock,
            patch("gov_agent.document_vault.cleanup_document_duplicates") as cleanup_mock,
            patch("gov_agent.rag_engine.ingest_document", new=AsyncMock()) as ingest_mock,
        ):
            async with main.lifespan(main.app):
                pass

        validate_config_mock.assert_called_once_with()
        initialize_text_router_mock.assert_not_called()
        cleanup_mock.assert_not_called()
        ingest_mock.assert_not_awaited()


class BootstrapBackendTests(unittest.IsolatedAsyncioTestCase):
    async def test_bootstrap_runs_cleanup_and_ingest_when_collection_is_empty(self):
        bootstrap_backend = importlib.import_module("scripts.bootstrap_backend")
        fake_client = MagicMock()
        fake_collection = MagicMock()
        fake_collection.count.return_value = 0
        fake_client.get_collection.return_value = fake_collection

        with (
            patch.object(bootstrap_backend, "validate_config") as validate_config_mock,
            patch.object(bootstrap_backend, "cleanup_document_duplicates", return_value=2) as cleanup_mock,
            patch.object(bootstrap_backend.chromadb, "PersistentClient", return_value=fake_client),
            patch.object(bootstrap_backend.rag_engine, "ingest_document", new=AsyncMock(return_value=5)) as ingest_mock,
        ):
            await bootstrap_backend.bootstrap_backend()

        validate_config_mock.assert_called_once_with()
        cleanup_mock.assert_called_once_with()
        ingest_mock.assert_awaited_once()


if __name__ == "__main__":
    unittest.main()
