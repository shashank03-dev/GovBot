from __future__ import annotations

import httpx

from .base import classify_provider_error


def _build_messages(prompt: str, system_instruction: str | None) -> list[dict[str, str]]:
    messages: list[dict[str, str]] = []
    if system_instruction:
        messages.append({"role": "system", "content": system_instruction})
    messages.append({"role": "user", "content": prompt})
    return messages


class GroqTextProvider:
    def __init__(self, *, api_key: str, model: str):
        self._api_key = api_key
        self._model = model

    async def generate_text(
        self,
        prompt: str,
        *,
        system_instruction: str | None = None,
        temperature: float | None = None,
        max_output_tokens: int | None = None,
    ) -> str:
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self._model,
            "messages": _build_messages(prompt, system_instruction),
            "temperature": temperature if temperature is not None else 0.3,
            "max_tokens": max_output_tokens or 512,
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers=headers,
                    json=payload,
                )
                response.raise_for_status()
            data = response.json()
            return (
                data["choices"][0]["message"]["content"].strip()
            )
        except Exception as exc:
            raise classify_provider_error(exc) from exc
