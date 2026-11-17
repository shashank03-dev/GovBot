"""Keep a free-tier host awake by pinging the app's own public health URL.

Render's free web services sleep after 15 minutes without inbound traffic, and
the first request afterwards (often a WhatsApp webhook) waits ~30s for a cold
start. Requests to the public URL go through Render's proxy, so they count as
inbound traffic.

Opt-in: runs only when KEEP_ALIVE_URL is set (e.g. on Render to
https://<service>.onrender.com/govbot/health). It only issues GET requests and
never blocks startup.
"""

from __future__ import annotations

import asyncio
import logging
import os

import httpx

logger = logging.getLogger(__name__)

DEFAULT_INTERVAL_SECONDS = 600.0  # inside Render's 15-minute idle window
MIN_INTERVAL_SECONDS = 60.0


def keep_alive_settings() -> tuple[str, float] | None:
    url = os.getenv("KEEP_ALIVE_URL", "").strip()
    if not url:
        return None
    try:
        interval = float(os.getenv("KEEP_ALIVE_INTERVAL_SECONDS", DEFAULT_INTERVAL_SECONDS))
    except ValueError:
        interval = DEFAULT_INTERVAL_SECONDS
    return url, max(MIN_INTERVAL_SECONDS, interval)


async def ping_forever(url: str, interval: float) -> None:
    async with httpx.AsyncClient(timeout=30.0) as client:
        while True:
            await asyncio.sleep(interval)
            try:
                response = await client.get(url)
                if response.status_code >= 400:
                    logger.warning("keep-alive ping to %s returned %s", url, response.status_code)
            except Exception as exc:  # noqa: BLE001 - a failed ping must never kill the loop
                logger.warning("keep-alive ping to %s failed: %s", url, exc)


def start_keep_alive() -> asyncio.Task | None:
    settings = keep_alive_settings()
    if settings is None:
        return None
    url, interval = settings
    logger.info("keep-alive pinging %s every %.0fs", url, interval)
    return asyncio.create_task(ping_forever(url, interval), name="keep-alive")


async def stop_keep_alive(task: asyncio.Task | None) -> None:
    if task is None:
        return
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
