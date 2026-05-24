
import chromadb
import pdfplumber
from gov_agent.gemini_client import embed_text, generate_text


chroma_client = chromadb.PersistentClient(path="./chroma_db")
collection = chroma_client.get_or_create_collection(
    name="scheme_rules",
    metadata={"hnsw:space": "cosine"}
)


async def ingest_document(pdf_path: str) -> int:
    with pdfplumber.open(pdf_path) as pdf:
        full_text = ""
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                full_text += text + "\n"

    chunks = []
    i = 0
    while i < len(full_text):
        chunks.append(full_text[i:i + 500])
        i += 450

    for idx, chunk in enumerate(chunks):
        collection.upsert(
            ids=[f"chunk_{idx}"],
            embeddings=[embed_text(chunk, task_type="RETRIEVAL_DOCUMENT")],
            documents=[chunk],
            metadatas=[{"source": pdf_path, "chunk_index": idx}]
        )

    return len(chunks)


async def query_eligibility(question: str) -> str:
    results = collection.query(
        query_embeddings=[embed_text(question, task_type="RETRIEVAL_QUERY")],
        n_results=3
    )

    docs = results.get("documents")
    chunks = "\n\n".join(docs[0]) if docs and docs[0] else ""

    prompt = f"""
    You are a government scheme
    eligibility expert for India.

    Scheme Rules:
    {chunks}

    Citizen Question: {question}

    Answer clearly with:
    - Eligibility: Yes/No/Maybe
    - Required age range if applicable
    - Income limit if applicable
    - Documents needed
    - If unsure, say clearly

    Keep answer under 200 words.
    """

    try:
        return generate_text(prompt)
    except Exception:
        if chunks:
            excerpt = chunks.replace("\n", " ").strip()[:500]
            return (
                "Eligibility guidance is temporarily unavailable from Gemini right now. "
                f"Please review these stored rule notes while you retry: {excerpt}"
            )
        return (
            "Eligibility guidance is temporarily unavailable from Gemini right now. "
            "Please retry in a moment or review the scheme rules manually."
        )
