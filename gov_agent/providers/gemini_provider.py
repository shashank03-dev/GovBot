from __future__ import annotations

import asyncio

from gov_agent import gemini_client

from .base import classify_provider_error


class GeminiTextProvider:
    """Chat replies through the shared Gemini pool.

    The pool owns the API keys, so chat and document analysis share one rate
    budget per project. ``api_key`` is accepted for config compatibility only.
    """

    def __init__(self, *, api_key: str = "", model: str):
        self._model_name = model

    async def generate_text(
        self,
        prompt: str,
        *,
        system_instruction: str | None = None,
        temperature: float | None = None,
        max_output_tokens: int | None = None,
    ) -> str:
        try:
            return await asyncio.to_thread(
                gemini_client.generate_text,
                prompt,
                model=self._model_name,
                system_instruction=system_instruction,
                temperature=temperature if temperature is not None else 0.3,
                max_output_tokens=max_output_tokens or 512,
            )
        except Exception as exc:
            raise classify_provider_error(exc) from exc
