"""
Environment variable configuration module.

This module loads environment variables from a .env file and exports them
as configurable constants for the application.

- WHATSAPP_TOKEN: The authentication token for the WhatsApp API.
- WHATSAPP_PHONE_NUMBER_ID: The unique phone number identifier for WhatsApp.
- WHATSAPP_VERIFY_TOKEN: The verification token used to authenticate
  WhatsApp webhooks.
- SUPABASE_URL: The endpoint URL for the Supabase project database.
- SUPABASE_KEY: The API key for authenticating with the Supabase project.
- GEMINI_API_KEY: The API key for accessing Google's Gemini AI services.
- GEMINI_GENERATION_MODELS: Optional comma-separated Gemini text/vision
  generation fallback order.
- GEMINI_VISION_VALIDATION: Optional flag for a second Gemini image check
  after OCR extraction. Disabled by default to conserve free-tier quota.
- MISTRAL_API_KEY / MISTRAL_API_KEY_1: Optional Mistral key for Document AI OCR.
- LOCAL_OCR_ENABLED: Prefer local OCR before remote model OCR. Enabled by default.

Call ``validate_config()`` at application startup to assert all required vars
are present. Importing this module never raises, making test/CI imports safe.
"""
import json
import logging
import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

DEFAULT_DEV_SECRET_KEY = "govbot-dev-secret-key-for-local-only"


def _float_env(name: str, default: float) -> float:
    try:
        return max(0.0, float(os.getenv(name, str(default))))
    except (TypeError, ValueError):
        logger.warning("Invalid float for %s; using %.2f", name, default)
        return default

WHATSAPP_TOKEN = os.getenv("WHATSAPP_TOKEN")
WHATSAPP_PHONE_NUMBER_ID = os.getenv("WHATSAPP_PHONE_NUMBER_ID")
WHATSAPP_VERIFY_TOKEN = os.getenv("WHATSAPP_VERIFY_TOKEN")
WHATSAPP_OTP_TEMPLATE_NAME = os.getenv("WHATSAPP_OTP_TEMPLATE_NAME", "")
WHATSAPP_OTP_TEMPLATE_LANGUAGE = os.getenv("WHATSAPP_OTP_TEMPLATE_LANGUAGE", "en_US")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
SUPABASE_DOCUMENTS_BUCKET = os.getenv("SUPABASE_DOCUMENTS_BUCKET", "user-documents")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_GENERATION_MODELS = os.getenv("GEMINI_GENERATION_MODELS", "")
GEMINI_VISION_VALIDATION = os.getenv("GEMINI_VISION_VALIDATION", "false").lower() == "true"
MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY") or os.getenv("MISTRAL_API_KEY_1", "")
MISTRAL_OCR_MODEL = os.getenv("MISTRAL_OCR_MODEL", "mistral-ocr-latest")
MISTRAL_OCR_ENABLED = os.getenv("MISTRAL_OCR_ENABLED", "true").lower() == "true"
LOCAL_OCR_ENABLED = os.getenv("LOCAL_OCR_ENABLED", "true").lower() == "true"
LOCAL_OCR_TIMEOUT_SECONDS = _float_env("LOCAL_OCR_TIMEOUT_SECONDS", 4.0)
SECRET_KEY = os.getenv("SECRET_KEY") or DEFAULT_DEV_SECRET_KEY
OFFICIAL_USERNAME = os.getenv("OFFICIAL_USERNAME", "")
OFFICIAL_PASSWORD = os.getenv("OFFICIAL_PASSWORD", "")

_REQUIRED = [
    "WHATSAPP_TOKEN",
    "WHATSAPP_PHONE_NUMBER_ID",
    "WHATSAPP_VERIFY_TOKEN",
    "SUPABASE_URL",
    "SUPABASE_KEY",
    "GEMINI_API_KEY",
    "SECRET_KEY",
]


def validate_config() -> None:
    """Raise ValueError listing all missing required env vars.

    Call once at application startup (e.g. lifespan handler or __main__).
    Importing the module is always safe even without a .env file.
    """
    missing = [k for k in _REQUIRED if not os.getenv(k)]
    if missing:
        raise ValueError(f"Missing required environment variables: {', '.join(missing)}")


@dataclass(frozen=True)
class TextProviderEnvConfig:
    name: str
    provider: str
    model: str
    api_key_env: str
    enabled: bool = True
    weight: int = 1


def load_text_provider_env_configs() -> list[TextProviderEnvConfig]:
    raw = os.getenv("TEXT_LLM_PROVIDERS_JSON", "").strip()
    if not raw:
        return []

    payload = json.loads(raw)
    configs: list[TextProviderEnvConfig] = []
    for item in payload:
        configs.append(
            TextProviderEnvConfig(
                name=str(item["name"]),
                provider=str(item["provider"]).lower(),
                model=str(item["model"]),
                api_key_env=str(item["api_key_env"]),
                enabled=bool(item.get("enabled", True)),
                weight=max(1, int(item.get("weight", 1))),
            )
        )
    return configs

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM_NUMBER = os.getenv("TWILIO_FROM_NUMBER", "")

BASE_URL = os.getenv("BASE_URL", "https://govbot.vercel.app")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://govbot-fawn.vercel.app")

# Optional: DigiLocker (Setu) - Mock mode works without these
SETU_CLIENT_ID = os.getenv("SETU_CLIENT_ID", "")
SETU_CLIENT_SECRET = os.getenv("SETU_CLIENT_SECRET", "")
SETU_API_KEY = os.getenv("SETU_API_KEY", "")
SETU_PRODUCT_ID = os.getenv("SETU_PRODUCT_ID", "")

# Optional: NPCI Bank Verification (Sandbox.co) - Mock mode works without these
SANDBOX_API_KEY = os.getenv("SANDBOX_API_KEY", "")
SANDBOX_API_SECRET = os.getenv("SANDBOX_API_SECRET", "")
SANDBOX_ACCESS_TOKEN = os.getenv("SANDBOX_ACCESS_TOKEN", "")

# Optional: Blockchain (Polygon) - Mock mode works without these
ALCHEMY_API_KEY = os.getenv("ALCHEMY_API_KEY", "")
POLYGON_PRIVATE_KEY = os.getenv("POLYGON_PRIVATE_KEY", "")
POLYGON_RPC_URL = os.getenv("POLYGON_RPC_URL", "https://rpc-mumbai.maticvigil.com")
CONTRACT_ADDRESS = os.getenv("CONTRACT_ADDRESS", "")
CREDENTIAL_CHAIN_NAME = os.getenv("CREDENTIAL_CHAIN_NAME", "Polygon Mumbai")
CREDENTIAL_EXPLORER_BASE_URL = os.getenv(
    "CREDENTIAL_EXPLORER_BASE_URL",
    "https://mumbai.polygonscan.com/tx/",
)

TREASURY_CHAIN_ID = int(os.getenv("TREASURY_CHAIN_ID", "80002"))
TREASURY_NETWORK_NAME = os.getenv("TREASURY_NETWORK_NAME", "Polygon Amoy")
TREASURY_EXPLORER_BASE_URL = os.getenv(
    "TREASURY_EXPLORER_BASE_URL",
    "https://amoy.polygonscan.com/tx/",
)
TREASURY_APPROVED_WALLET = os.getenv("TREASURY_APPROVED_WALLET", "").lower()
TREASURY_RELEASE_ANCHOR_ADDRESS = os.getenv("TREASURY_RELEASE_ANCHOR_ADDRESS", "").strip().lower()
TREASURY_LEDGER_FILE = os.getenv("TREASURY_LEDGER_FILE", "/tmp/govbot-treasury-ledger.json")
TREASURY_SANCTIONS_JSON = os.getenv("TREASURY_SANCTIONS_JSON", "[]")

# Optional: IPFS (Pinata) - Mock mode works without these
PINATA_API_KEY = os.getenv("PINATA_API_KEY", "")
PINATA_SECRET_KEY = os.getenv("PINATA_SECRET_KEY", "")

# Feature flags
MOCK_DIGILOCKER = os.getenv("MOCK_DIGILOCKER", "true").lower() == "true"
MOCK_NPCI = os.getenv("MOCK_NPCI", "true").lower() == "true"
MOCK_DIGILOCKER_CALLBACK_DELAY_SECONDS = _float_env("MOCK_DIGILOCKER_CALLBACK_DELAY_SECONDS", 0.0)
MOCK_NPCI_DELAY_SECONDS = _float_env("MOCK_NPCI_DELAY_SECONDS", 0.0)
