# Hackathon Demo Fix — Design Spec

## Goal
Make GOVbot demo-ready for judges: WhatsApp bot is primary, web mirrors it, a bridge connects both visually.

## Demo Narrative
1. New user sends "Hi" on WhatsApp
2. Bot collects profile (name, DOB, phone, etc.)
3. Bot runs eligibility + fills scholarship form (existing hardcoded portal demo)
4. If data missing → bot asks user to upload document photo
5. Bot OCRs document, extracts + stores data in Supabase
6. User asks "what's my PAN?" → bot asks 4-digit passkey → reveals number
7. Bot sends web links (dashboard, track, wallet)
8. Web shows live activity feed, documents, application status
9. QR code from bot opens web pre-authenticated

## Architecture Changes

### Tier 1: Unbreak Everything

**1.1 API Proxy** (`frontend/next.config.ts`)
- Add `rewrites()` to route `/api/*` → FastAPI backend URL
- Fixes ALL 15+ broken frontend→backend connections

**1.2 Env Var Standardization**
- Standardize on `NEXT_PUBLIC_API_URL` everywhere
- Fix `NEXT_PUBLIC_SUPABASE_ANON_KEY` → use the correct name from `.env.local`
- Remove `NEXT_PUBLIC_RAILWAY_URL` references

**1.3 Login Flow Fix** (`frontend/pages/login.tsx`)
- Remove `'dummy-token-fallback'`
- Check `data.valid` before storing token
- Show error on failed OTP

**1.4 Dashboard Supabase Key** (`frontend/pages/dashboard.tsx`)
- Use `NEXT_PUBLIC_SUPABASE_KEY` (matches `.env.local`)

### Tier 2: Wire the Demo Narrative

**2.1 WhatsApp Bot Flow** (`gov_agent/flow_router.py`, `session_manager.py`)
- Verify onboard → collect_profile → check_eligibility → form_fill chain works
- Ensure OCR upload path: user sends image → bot calls OCR → stores extracted fields
- Add "missing field" detection: if form needs PAN but profile lacks it, bot asks for doc

**2.2 Passkey Gate** (`gov_agent/flow_router.py`)
- Add `passkey` field to citizen_profiles (4-digit PIN, set during onboarding)
- New intent: when user asks for sensitive data, bot prompts "Enter your 4-digit passkey"
- On match: reveal the data. On fail: deny with retry.

**2.3 Bot Sends Web Links**
- After form submission: send "Track: {WEB_URL}/track/{confirmation_id}"
- After document upload: send "View documents: {WEB_URL}/wallet"
- After profile complete: send "Dashboard: {WEB_URL}/dashboard"
- `WEB_URL` = env var `FRONTEND_URL` (defaults to `https://govbot-fawn.vercel.app`)

### Tier 3: Bridge (Wow Factor)

**3.1 Live Activity Feed** (`gov_agent/live_router.py` + frontend component)
- Backend: `POST /live/event` — stores timestamped activity events per phone
- Backend: `GET /live/feed/{phone}` — returns recent events (polling, every 3s)
- Frontend: A "Live Activity" card on dashboard showing bot actions in real-time
- Events: "Profile collected", "Form filled", "Document uploaded: PAN", "Application submitted"

**3.2 QR Code Login**
- After onboarding, bot generates a short-lived token URL: `{WEB_URL}/login?token={jwt}`
- Bot sends this as a QR code image (use `qrcode` Python lib)
- Frontend `/login` page: if `?token=` param exists, validate JWT and auto-login
- Judge scans QR from the phone screen → web opens pre-authenticated

## What We're NOT Fixing (acceptable for demo)
- Security (secrets in .env, auth bypass, SSRF)
- Real portal submission (mock is fine)
- Real blockchain (mock hash is fine)
- Real DigiLocker integration
- Real bank verification (mock random names are fine)
- Production readiness

## Success Criteria
- Judge can watch WhatsApp conversation happen on phone
- Web dashboard updates as bot works (live feed)
- Bot sends links that open working web pages
- Passkey gate works for sensitive data retrieval
- No blank screens or 404s when clicking through web UI
