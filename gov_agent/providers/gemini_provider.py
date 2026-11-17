from __future__ import annotations

import asyncio
import logging

from gov_agent import gemini_client
from gov_agent.config import GEMINI_API_KEYS

from .base import classify_provider_error


class GeminiTextProvider:
    """Chat replies through the shared Gemini pool.

    The pool owns the API keys, so chat and document analysis share one rate
    budget per project. Keys come from GEMINI_API_KEY / GEMINI_API_KEY_2.
    """

    def __init__(self, *, api_key: str = "", model: str):
        self._model_name = model
        if api_key and api_key not in GEMINI_API_KEYS:
            logging.getLogger(__name__).warning(
                "Gemini provider key is not GEMINI_API_KEY or GEMINI_API_KEY_2 and will not be used; "
                "set it as GEMINI_API_KEY_2 to add its project's quota"
            )

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
