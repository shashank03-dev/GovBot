from __future__ import annotations

import base64
import logging
from typing import Any

from google import genai
from google.genai import types

from gov_agent.config import GEMINI_API_KEY, GEMINI_GENERATION_MODELS

DEFAULT_GENERATION_MODEL = "gemini-2.5-flash"
GENERATION_MODEL_FALLBACKS = ("gemini-2.0-flash",)
DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001"
NON_RETRIABLE_GENERATION_ERROR_MARKERS = (
    "RESOURCE_EXHAUSTED",
    "INVALID_ARGUMENT",
    "UNABLE TO PROCESS INPUT IMAGE",
)

logger = logging.getLogger(__name__)

_client: genai.Client | None = None


def has_gemini_client() -> bool:
    return bool(GEMINI_API_KEY)


def get_gemini_client() -> genai.Client:
    global _client

    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY is not configured")

    if _client is None:
        _client = genai.Client(api_key=GEMINI_API_KEY)
    return _client


def inline_data_part(*, data_b64: str, mime_type: str) -> types.Part:
    return types.Part.from_bytes(
        data=base64.b64decode(data_b64),
        mime_type=mime_type,
    )


def _split_generation_models(raw_models: str) -> list[str]:
    models: list[str] = []
    for raw_model in raw_models.split(","):
        model = raw_model.strip()
        if model and model not in models:
            models.append(model)
    return models


def _generation_models_for_request(model: str) -> list[str]:
    configured_models = _split_generation_models(GEMINI_GENERATION_MODELS)
    if configured_models:
        candidates = (
            configured_models
            if model == DEFAULT_GENERATION_MODEL
            else [model, *configured_models]
        )
    else:
        candidates = [model, *GENERATION_MODEL_FALLBACKS]

    deduped: list[str] = []
    for candidate in candidates:
        if candidate and candidate not in deduped:
            deduped.append(candidate)
    return deduped


def _should_stop_generation_fallback(exc: Exception) -> bool:
    message = f"{type(exc).__name__}: {exc}".upper()
    return any(marker in message for marker in NON_RETRIABLE_GENERATION_ERROR_MARKERS)


def generate_text(
    contents: Any,
    *,
    model: str = DEFAULT_GENERATION_MODEL,
    system_instruction: str | None = None,
    response_mime_type: str | None = None,
    temperature: float | None = None,
    max_output_tokens: int | None = None,
) -> str:
    config_kwargs: dict[str, Any] = {}
    if system_instruction:
        config_kwargs["system_instruction"] = system_instruction
    if response_mime_type:
        config_kwargs["response_mime_type"] = response_mime_type
    if temperature is not None:
        config_kwargs["temperature"] = temperature
    if max_output_tokens is not None:
        config_kwargs["max_output_tokens"] = max_output_tokens

    client = get_gemini_client()
    models = _generation_models_for_request(model)
    last_exc: Exception | None = None

    for index, candidate_model in enumerate(models):
        try:
            response = client.models.generate_content(
                model=candidate_model,
                contents=contents,
                config=types.GenerateContentConfig(**config_kwargs) if config_kwargs else None,
            )
            return (response.text or "").strip()
        except Exception as exc:
            last_exc = exc
            if _should_stop_generation_fallback(exc):
                logger.warning(
                    "Gemini model %s failed with a non-retriable error; not trying fallback models: %s",
                    candidate_model,
                    exc,
                )
                break
            if index < len(models) - 1:
                logger.warning(
                    "Gemini model %s failed; trying fallback model %s: %s",
                    candidate_model,
                    models[index + 1],
                    exc,
                )

    if last_exc:
        raise last_exc
    raise RuntimeError("No Gemini generation models configured")


def embed_text(
    content: Any,
    *,
    model: str = DEFAULT_EMBEDDING_MODEL,
    task_type: str | None = None,
) -> list[float]:
    config_kwargs: dict[str, Any] = {}
    if task_type:
        config_kwargs["task_type"] = task_type

    response = get_gemini_client().models.embed_content(
        model=model,
        contents=content,
        config=types.EmbedContentConfig(**config_kwargs) if config_kwargs else None,
    )
    embeddings = list(response.embeddings or [])
    if not embeddings:
        raise ValueError("Gemini returned no embeddings")
    return list(embeddings[0].values)
