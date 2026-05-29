from __future__ import annotations

import asyncio

from google import genai
from google.genai import types

from .base import classify_provider_error


class GeminiTextProvider:
    def __init__(self, *, api_key: str, model: str):
        self._client = genai.Client(api_key=api_key)
        self._model_name = model

    async def generate_text(
        self,
        prompt: str,
        *,
        system_instruction: str | None = None,
        temperature: float | None = None,
        max_output_tokens: int | None = None,
    ) -> str:
        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=temperature if temperature is not None else 0.3,
            max_output_tokens=max_output_tokens or 512,
        )
        try:
            response = await asyncio.to_thread(
                self._client.models.generate_content,
                model=self._model_name,
                contents=prompt,
                config=config,
            )
            return (response.text or "").strip()
        except Exception as exc:
            raise classify_provider_error(exc) from exc
