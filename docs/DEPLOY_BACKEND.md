# Deploying the GovBot backend

> **Current free option: Render.** As of November 2026 Hugging Face only hosts Docker Spaces
> for PRO accounts (creating one returns `402 Payment Required`), so the free deploy is the
> Render web service described by `render.yaml` (free plan, Singapore, Docker). Deploy from
> `main`, set the secrets marked `sync: false` on the service's Environment page, and refresh
> `WHATSAPP_TOKEN` there before each demo when using Meta's 24-hour test token.
>
> `KEEP_ALIVE_URL` makes the backend ping its own health URL every 10 minutes so the free
> instance never sleeps (Render sleeps it after 15 idle minutes). An always-on service uses
> ~744 of the workspace's 750 free instance-hours per month, shared with other free services.
>
> Gemini rate limits apply per Google Cloud project, not per key: `GEMINI_API_KEY_2` only adds
> quota when it comes from a second project.
>
> The Hugging Face instructions below still work on a PRO account.

## WhatsApp through the Twilio Sandbox (no Meta business verification)

New Meta accounts can receive webhooks but can't deliver replies until the business is
verified and has a payment method (errors 131031 / 141006 / 141010). For demos, switch the
channel to Twilio's free WhatsApp Sandbox instead:

1. Sign up at twilio.com (trial credit, no card), then open **Messaging → Try it out →
   Send a WhatsApp message**. From each demo phone, send the shown `join <code>` message to the
   sandbox number. A phone that sends nothing for 3 days must send `join <code>` again.
2. In **Sandbox settings**, set **When a message comes in** to
   `https://<backend>/govbot/twilio/webhook` (method `POST`) and save.
3. On the backend set `WHATSAPP_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`
   and `TWILIO_WHATSAPP_FROM=whatsapp:+14155238886` (the sandbox number), then redeploy.

The webhook checks `X-Twilio-Signature` against `TWILIO_AUTH_TOKEN`. If Twilio's requests are
rejected with 403, set `TWILIO_WEBHOOK_URL` to the exact URL from step 2. The Meta webhook
stays mounted, so switching back is just `WHATSAPP_PROVIDER=meta`.

## Hugging Face Spaces (PRO accounts)

The backend is a container (Playwright + tesseract-ocr + FastAPI + ChromaDB), so it needs a
container host, not serverless. Hugging Face **Docker Spaces** give a free CPU tier of
**2 vCPU / 16 GB RAM / 50 GB disk** with no credit card, which comfortably fits the ~2 GB
Playwright image. The frontend stays on Vercel.

## What's in this repo for the deploy

| File | Role |
| --- | --- |
| `Dockerfile` | Already container-ready; listens on port 8080 |
| `.dockerignore` | Keeps the 1.3 GB `frontend/` and tooling out of the image; keeps the two demo images and `chroma_db/` in |
| `deploy/hf_space_README.md` | Space metadata (`sdk: docker`, `app_port: 8080`) |
| `scripts/deploy_hf_space.py` | One command: create Space, upload code, push all `.env` secrets |

## One-time deploy

```bash
# 1. Create a WRITE token at https://huggingface.co/settings/tokens
# 2. Log in (token is stored on disk, not in the repo):
hf auth login

# 3. From the repo root:
python scripts/deploy_hf_space.py
```

The script prints the Space URL and a health-check link, then the Space builds automatically
(first build ~5-8 min while it pulls the Playwright base image).

Optional overrides:

```bash
SPACE_NAME=govbot-api FRONTEND_URL=https://govbot-fawn.vercel.app \
  python scripts/deploy_hf_space.py
```

## Environment variables

Secrets are pushed from your local `.env` to the Space's **Settings → Secrets** — they are
never committed and never printed. The 7 startup-required keys are:

`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `SUPABASE_URL`,
`SUPABASE_KEY`, `GEMINI_API_KEY`, `SECRET_KEY`. If any is missing the Space boots unhealthy
(the app calls `validate_config()` at startup).

The script sets these three to production values automatically (do not rely on the local ones):

| Variable | Value set |
| --- | --- |
| `BASE_URL` | the Space URL (`https://<user>-govbot.hf.space`) |
| `FRONTEND_URL` | your Vercel frontend origin |
| `CORS_ORIGINS` | `<frontend origin>,<space URL>` |

Everything else (Gemini models, Twilio, Setu/DigiLocker, NPCI sandbox, Polygon/Pinata,
`OFFICIAL_USERNAME`/`OFFICIAL_PASSWORD`, the mock toggles) is copied as-is from `.env`.
Placeholder values (`replace-...`, `your-...`) and empty values are skipped.

## After the first deploy

1. **WhatsApp webhook** — in the Meta WhatsApp app, set the callback URL to
   `https://<user>-govbot.hf.space/govbot/webhook` and the verify token to your
   `WHATSAPP_VERIFY_TOKEN`.
2. **Point the frontend at the new backend** — on Vercel, set the frontend project's
   `NEXT_PUBLIC_API_URL` and `BACKEND_URL` to `https://<user>-govbot.hf.space`, then redeploy.
3. **Health check** — open `https://<user>-govbot.hf.space/govbot/health`.

## Re-deploying after code changes

```bash
python scripts/deploy_hf_space.py
```

It reuses the same Space (`exist_ok=True`), re-uploads changed files, and re-applies secrets.

## Notes and caveats

- **Sleep on free tier:** the Space sleeps after inactivity and cold-starts (~1 min) on the
  next request. Fine for a demo; upgrade hardware or ping it to keep it warm if needed.
- **Ephemeral disk:** HF persistent storage is discontinued, so anything written at runtime is
  lost on restart. Startup is non-mutating, and `chroma_db/` ships prebuilt, so this is fine.
- **Playwright version:** `requirements.txt` installs the latest `playwright`, while the base
  image ships browsers for v1.58.0. If the form-fill automation reports a missing browser,
  pin `playwright==1.58.0` in `requirements.txt` to match the base image.
