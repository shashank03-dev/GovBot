from __future__ import annotations

import asyncio
import logging
import os
from functools import partial

from gov_agent import gemini_client
from gov_agent.config import GEMINI_API_KEYS

from .base import classify_provider_error

logger = logging.getLogger(__name__)

# Gemini rejects request deadlines under 10s, so a stalled call can't be cut
# short. Instead, when the first attempt is slow we send a second ("hedged")
# attempt, which the pool starts on the other key, and take whichever answers
# first. Measured Flash-Lite chat latency swings between 0.5s and 11s.
CHAT_ATTEMPT_TIMEOUT_MS = 10_000
CHAT_HEDGE_AFTER_SECONDS = float(os.getenv("GEMINI_CHAT_HEDGE_AFTER_SECONDS", "2.5"))


class GeminiTextProvider:
    """Chat replies through the shared Gemini pool.

    The pool owns the API keys, so chat and document analysis share one rate
    budget per project. Keys come from GEMINI_API_KEY / GEMINI_API_KEY_2.
    """

    def __init__(self, *, api_key: str = "", model: str):
        self._model_name = model
        if api_key and api_key not in GEMINI_API_KEYS:
            logger.warning(
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
        call = partial(
            gemini_client.generate_text,
            prompt,
            model=self._model_name,
            system_instruction=system_instruction,
            temperature=temperature if temperature is not None else 0.3,
            max_output_tokens=max_output_tokens or 512,
            timeout_ms=CHAT_ATTEMPT_TIMEOUT_MS,
        )
        try:
            return await _hedged(call, CHAT_HEDGE_AFTER_SECONDS)
        except Exception as exc:
            raise classify_provider_error(exc) from exc


async def _hedged(call, hedge_after: float) -> str:
    """Run ``call`` in a thread; if it's slow, race a second attempt against it.

    Returns the first successful result. Raises the last error only when every
    attempt failed. A losing attempt keeps running in its thread (sync HTTP
    can't be cancelled); its result is discarded.
    """
    first = asyncio.ensure_future(asyncio.to_thread(call))
    done, _ = await asyncio.wait({first}, timeout=hedge_after)
    if done and first.exception() is None:
        return first.result()

    pending = {first} if not done else set()
    hedge = asyncio.ensure_future(asyncio.to_thread(call))
    pending.add(hedge)
    if not done:
        logger.info("gemini chat slower than %.1fs; sending hedged attempt", hedge_after)

    last_exc: BaseException | None = first.exception() if done else None
    while pending:
        done, pending = await asyncio.wait(pending, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            if task.exception() is None:
                for loser in pending:
                    loser.add_done_callback(_discard_result)
                return task.result()
            last_exc = task.exception()
    assert last_exc is not None
    raise last_exc


def _discard_result(task: asyncio.Future) -> None:
    if not task.cancelled():
        task.exception()  # mark retrieved so asyncio doesn't log it
