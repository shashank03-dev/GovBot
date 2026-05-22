import os
import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from gov_agent import auth_router

try:
    from api.app import app  # type: ignore
except ImportError:
    app = FastAPI(
        title="GovBot",
        description="WhatsApp Gov Services",
        version="1.0.0"
    )

_cors_origins = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", "https://govbot.vercel.app,http://localhost:3000").split(",")
    if o.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

from gov_agent import whatsapp_webhook
app.include_router(
    whatsapp_webhook.router,
    prefix="/govbot/webhook",
    tags=["WhatsApp"]
)

from gov_agent import auth_router
app.include_router(
    auth_router.router,
    prefix="/auth",
    tags=["Auth"]
)

from gov_agent import pm_kisan_router
app.include_router(
    pm_kisan_router.router,
    prefix="/pm-kisan",
    tags=["PM Kisan"]
)

from gov_agent import eligibility_router
app.include_router(
    eligibility_router.router,
    prefix="/eligibility",
    tags=["Eligibility"]
)

from gov_agent import track_router
app.include_router(
    track_router.router,
    prefix="/applications",
    tags=["Track"]
)

from gov_agent import portal_router
app.include_router(
    portal_router.router,
    prefix="/portals",
    tags=["Portals"]
)

from gov_agent import ocr_router
app.include_router(
    ocr_router.router,
    prefix="/ocr",
    tags=["OCR"]
)

from gov_agent import doc_validator_router
app.include_router(
    doc_validator_router.router,
    prefix="/documents",
    tags=["Documents"]
)

from gov_agent import live_router
app.include_router(
    live_router.router,
    prefix="/live",
    tags=["Live"]
)

from gov_agent import renewal_router
app.include_router(
    renewal_router.router,
    prefix="/renewals",
    tags=["Renewals"]
)

from gov_agent import digilocker_router
app.include_router(
    digilocker_router.router,
    prefix="/api",
    tags=["DigiLocker"]
)

from gov_agent import npci_router
app.include_router(
    npci_router.router,
    prefix="/api",
    tags=["NPCI"]
)

from gov_agent import credentials_router
app.include_router(
    credentials_router.router,
    prefix="/api",
    tags=["Credentials"]
)

from gov_agent import analytics_router
app.include_router(
    analytics_router.router,
    prefix="/api",
    tags=["Analytics"]
)

from gov_agent import profile_router
app.include_router(
    profile_router.router,
    prefix="/profile",
    tags=["Profile"]
)

from gov_agent import form_scanner_router
app.include_router(
    form_scanner_router.router,
    prefix="/form-scanner",
    tags=["Form Scanner"]
)


@asynccontextmanager
async def lifespan(app):
    from gov_agent.config import validate_config
    from gov_agent.document_vault import cleanup_document_duplicates
    validate_config()
    try:
        removed = cleanup_document_duplicates()
        if removed:
            print(f"Document vault: removed {removed} duplicate rows")
    except Exception as exc:
        print(f"Document vault cleanup skipped: {exc}")
    # Check if RAG needs ingestion
    import chromadb
    client = chromadb.PersistentClient(
        "./chroma_db")
    try:
        col = client.get_collection(
            "scheme_rules")
        if col.count() == 0:
            raise ValueError("Empty")
    except Exception:
        from gov_agent import rag_engine
        count = await rag_engine.ingest_document(
            "gov_agent/docs/scholarship_rules.pdf"
        )
        print(f"RAG: ingested {count} chunks")
    yield

app.router.lifespan_context = lifespan


@app.get("/govbot/health")
async def health():
    return {
        "status": "ok",
        "service": "GovBot v1.0",
        "whatsapp": "connected",
        "digilocker": "mock_enabled"
    }

if __name__ == "__main__":
    uvicorn.run(
        "gov_agent.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
