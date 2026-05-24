from __future__ import annotations

import asyncio

import google.generativeai as genai

from .base import classify_provider_error


class GeminiTextProvider:
    def __init__(self, *, api_key: str, model: str):
        genai.configure(api_key=api_key)
        self._model_name = model

    async def generate_text(
        self,
        prompt: str,
        *,
        system_instruction: str | None = None,
        temperature: float | None = None,
        max_output_tokens: int | None = None,
    ) -> str:
        if system_instruction:
            model = genai.GenerativeModel(
                self._model_name,
                system_instruction=system_instruction,
            )
        else:
            model = genai.GenerativeModel(self._model_name)
        try:
            response = await asyncio.to_thread(
                model.generate_content,
                prompt,
                generation_config={
                    "temperature": temperature if temperature is not None else 0.3,
                    "max_output_tokens": max_output_tokens or 512,
                },
            )
            return (response.text or "").strip()
        except Exception as exc:
            raise classify_provider_error(exc) from exc
