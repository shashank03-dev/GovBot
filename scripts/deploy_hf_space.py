#!/usr/bin/env python3
"""Deploy the GovBot FastAPI backend to a Hugging Face Docker Space.

What it does, in order:
  1. Authenticates with your HF token (from `hf auth login` or the HF_TOKEN env var).
  2. Creates (or reuses) a public Docker Space under your account.
  3. Uploads the backend code, using .dockerignore-style excludes so the 1.3 GB
     frontend and local tooling never get shipped.
  4. Uploads the Space README (with the `sdk: docker` / `app_port: 8080` metadata).
  5. Pushes every real value from your local `.env` as a Space *secret* — values are
     never printed to the terminal. Placeholders and empty values are skipped.
  6. Applies production overrides for the public URLs (BASE_URL, FRONTEND_URL,
     CORS_ORIGINS) so the deployed backend and the Vercel frontend talk to each other.

Usage:
    hf auth login                      # once, with a write-scoped token
    python scripts/deploy_hf_space.py  # from the repo root

Optional environment overrides:
    SPACE_NAME     Space repo name (default: "govbot")
    FRONTEND_URL   Public frontend origin (default: https://govbot-fawn.vercel.app)
    HF_TOKEN       Token, if you did not run `hf auth login`
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

from huggingface_hub import HfApi

REPO_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = REPO_ROOT / ".env"
HF_README = REPO_ROOT / "deploy" / "hf_space_README.md"

SPACE_NAME = os.getenv("SPACE_NAME", "govbot")
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://govbot-fawn.vercel.app").rstrip("/")

# Files/dirs that must never be uploaded to the Space (mirrors .dockerignore intent).
IGNORE_PATTERNS = [
    "frontend/*",
    ".git/*",
    ".github/*",
    ".cursor/*",
    ".windsurf/*",
    ".superpowers/*",
    ".sixth/*",
    ".agents/*",
    ".claude/*",
    ".vercel/*",
    ".playwright-mcp/*",
    ".planning/*",
    "**/__pycache__/*",
    "*.pyc",
    ".pytest_cache/*",
    "tests/*",
    "docs/*",
    ".env",
    ".env.example",
    "README.md",  # replaced by the HF Space README below
]

# Keys we never push, or push with a production value instead of the local one.
SKIP_KEYS = {"BASE_URL", "FRONTEND_URL", "CORS_ORIGINS"}


def load_env(path: Path) -> dict[str, str]:
    """Parse a .env file into a dict, keeping only real (non-placeholder) values."""
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if not key or not val:
            continue
        if val.startswith("replace-") or val.startswith("your-"):
            continue
        values[key] = val
    return values


def main() -> int:
    if not HF_README.exists():
        print(f"ERROR: missing {HF_README}", file=sys.stderr)
        return 1

    api = HfApi(token=os.getenv("HF_TOKEN"))
    try:
        me = api.whoami()
    except Exception as exc:  # noqa: BLE001
        print(
            "ERROR: not authenticated. Run `hf auth login` with a write token first.\n"
            f"Detail: {exc}",
            file=sys.stderr,
        )
        return 1

    username = me["name"]
    repo_id = f"{username}/{SPACE_NAME}"
    space_host = f"{username}-{SPACE_NAME}".lower().replace("_", "-")
    space_url = f"https://{space_host}.hf.space"

    print(f"Authenticated as: {username}")
    print(f"Target Space:     {repo_id}")
    print(f"Public URL:       {space_url}")

    print("\n[1/4] Creating (or reusing) the Docker Space ...")
    api.create_repo(
        repo_id=repo_id,
        repo_type="space",
        space_sdk="docker",
        exist_ok=True,
        private=False,
    )

    print("[2/4] Uploading the Space README (docker metadata) ...")
    api.upload_file(
        path_or_fileobj=str(HF_README),
        path_in_repo="README.md",
        repo_id=repo_id,
        repo_type="space",
        commit_message="Add Space docker metadata",
    )

    print("[3/4] Uploading backend code (excluding frontend and tooling) ...")
    api.upload_folder(
        folder_path=str(REPO_ROOT),
        repo_id=repo_id,
        repo_type="space",
        ignore_patterns=IGNORE_PATTERNS,
        commit_message="Deploy GovBot backend",
    )

    print("[4/4] Pushing secrets from .env (values are not printed) ...")
    env = load_env(ENV_FILE)
    prod = {
        "BASE_URL": space_url,
        "FRONTEND_URL": FRONTEND_URL,
        "CORS_ORIGINS": f"{FRONTEND_URL},{space_url}",
    }
    pushed = 0
    for key, value in {**{k: v for k, v in env.items() if k not in SKIP_KEYS}, **prod}.items():
        api.add_space_secret(repo_id=repo_id, key=key, value=value)
        print(f"  set secret: {key}")
        pushed += 1

    print(f"\nDone. {pushed} secrets set. The Space is now building.")
    print("\nNext steps:")
    print(f"  1. Watch the build:   {space_url.replace('.hf.space', '')}"
          f"  ->  https://huggingface.co/spaces/{repo_id}")
    print(f"  2. Health check:      {space_url}/govbot/health")
    print(f"  3. WhatsApp webhook:  set the callback URL in Meta to  {space_url}/govbot/webhook")
    print(f"                        (verify token = your WHATSAPP_VERIFY_TOKEN)")
    print(f"  4. On Vercel, set the frontend's NEXT_PUBLIC_API_URL / BACKEND_URL to  {space_url}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
