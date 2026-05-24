from __future__ import annotations

import base64
from typing import Any

from google import genai
from google.genai import types

from gov_agent.config import GEMINI_API_KEY

DEFAULT_GENERATION_MODEL = "gemini-2.0-flash"
DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001"

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

    response = get_gemini_client().models.generate_content(
        model=model,
        contents=contents,
        config=types.GenerateContentConfig(**config_kwargs) if config_kwargs else None,
    )
    return (response.text or "").strip()


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
