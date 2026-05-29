import re
from pathlib import Path
from typing import Tuple

import httpx
from playwright.async_api import async_playwright, Browser, Page

from gov_agent.config import WHATSAPP_TOKEN


class FormFillError(Exception):
    """Raised when form selector not found"""
    pass


class SubmissionError(Exception):
    """Raised when submission fails"""
    pass


async def launch_browser() -> Tuple[Browser, Page]:
    playwright = await async_playwright().start()
    browser = await playwright.chromium.launch(
        headless=True,
        args=["--no-sandbox", "--disable-dev-shm-usage"]
    )
    page = await browser.new_page()
    await page.set_viewport_size({"width": 1280, "height": 720})
    return browser, page


async def download_media(media_id: str, save_path: str) -> str:
    headers = {"Authorization": f"Bearer {WHATSAPP_TOKEN}"}
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.get(
            f"https://graph.facebook.com/v18.0/{media_id}",
            headers=headers
        )
        response.raise_for_status()
        url = response.json()["url"]

        media_response = await client.get(url, headers=headers)
        media_response.raise_for_status()

        save_dir = Path(save_path).parent
        save_dir.mkdir(parents=True, exist_ok=True)

        Path(save_path).write_bytes(media_response.content)

    return save_path




async def fill_scholarship_form(page: Page, data: dict) -> None:
    # MOCK: Real form-fill automation not yet implemented (concern #1)
    Path("/tmp/screenshots").mkdir(parents=True, exist_ok=True)



async def submit_and_capture(page: Page) -> dict:
    # MOCK: Real portal submission not yet implemented (concern #1)
    import random
    import string
    conf = ''.join(random.choices(
        string.ascii_uppercase + string.digits, k=12))
    return {
        "status": "success",
        "confirmation_number": f"NSP2026{conf}"
    }
