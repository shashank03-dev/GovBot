import asyncio

import chromadb

from gov_agent.config import validate_config
from gov_agent.document_vault import cleanup_document_duplicates
from gov_agent import rag_engine

DEFAULT_CHROMA_PATH = "./chroma_db"
DEFAULT_COLLECTION_NAME = "scheme_rules"
DEFAULT_RULES_PDF = "gov_agent/docs/scholarship_rules.pdf"


async def bootstrap_backend(
    *,
    chroma_path: str = DEFAULT_CHROMA_PATH,
    collection_name: str = DEFAULT_COLLECTION_NAME,
    rules_pdf_path: str = DEFAULT_RULES_PDF,
) -> None:
    validate_config()

    removed = cleanup_document_duplicates()
    if removed:
        print(f"Document vault: removed {removed} duplicate rows")

    client = chromadb.PersistentClient(path=chroma_path)

    try:
        collection = client.get_collection(collection_name)
        needs_ingestion = collection.count() == 0
    except Exception:
        needs_ingestion = True

    if needs_ingestion:
        count = await rag_engine.ingest_document(rules_pdf_path)
        print(f"RAG: ingested {count} chunks")
    else:
        print("RAG: existing scheme rules collection found")


def main() -> None:
    asyncio.run(bootstrap_backend())


if __name__ == "__main__":
    main()
