# Hackathon Demo Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make GOVbot demo-ready so judges can see the WhatsApp bot → web bridge working end-to-end without dead ends.

**Architecture:** Fix the frontend→backend proxy (root cause of all broken flows), standardize env vars, fix login, add passkey gate to the bot, add live activity feed on web, and add QR code handoff from bot to web.

**Tech Stack:** Next.js (rewrites), FastAPI, Supabase, WhatsApp Business API, `qrcode` Python lib

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `frontend/next.config.ts` | Add API rewrites to backend |
| Modify | `frontend/.env.local` | Standardize env var names |
| Modify | `frontend/pages/login.tsx` | Fix dummy-token bug, add token-param auto-login |
| Modify | `frontend/pages/dashboard.tsx` | Fix Supabase key env var, add live activity card |
| Modify | `frontend/pages/wallet/index.tsx` | Fix API URL to use proxy |
| Modify | `gov_agent/flow_router.py` | Add passkey states, bot→web links, activity events |
| Modify | `gov_agent/session_manager.py` | Emit activity events on state transitions |
| Modify | `gov_agent/live_router.py` | Add activity feed endpoints |
| Modify | `gov_agent/config.py` | Add FRONTEND_URL config |
| Modify | `gov_agent/whatsapp_sender.py` | Add send_image helper for QR |
| Create | `gov_agent/qr_login.py` | QR code generation + short-lived token URL |
| Create | `frontend/pages/api/send-otp.ts` | Proxy to backend (alternative to rewrites for /api/* clash) |
| Create | `frontend/pages/api/verify-otp.ts` | Proxy to backend |

---

### Task 1: Fix API Proxy (Next.js Rewrites)

**Files:**
- Modify: `frontend/next.config.ts`
- Modify: `frontend/.env.local`

The core issue: frontend calls `/api/...` which Next.js intercepts. We need Next.js API routes that proxy to the backend for paths that clash (`/api/send-otp`, `/api/verify-otp`), and rewrites for everything else.

- [ ] **Step 1: Update `frontend/next.config.ts` with rewrites**

```typescript
import type { NextConfig } from "next";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  async rewrites() {
    return [
      // Auth routes
      { source: '/api/send-otp', destination: `${BACKEND_URL}/auth/send-otp` },
      { source: '/api/verify-otp', destination: `${BACKEND_URL}/auth/verify-otp` },
      // OCR
      { source: '/api/ocr/:path*', destination: `${BACKEND_URL}/ocr/:path*` },
      // Documents
      { source: '/api/documents/:path*', destination: `${BACKEND_URL}/documents/:path*` },
      // Bank
      { source: '/api/bank/:path*', destination: `${BACKEND_URL}/api/bank/:path*` },
      // DigiLocker
      { source: '/api/digilocker/:path*', destination: `${BACKEND_URL}/api/digilocker/:path*` },
      // Credentials
      { source: '/api/credentials/:path*', destination: `${BACKEND_URL}/api/credentials/:path*` },
      // Analytics
      { source: '/api/analytics/:path*', destination: `${BACKEND_URL}/api/analytics/:path*` },
      // Live sessions
      { source: '/api/live/:path*', destination: `${BACKEND_URL}/live/:path*` },
      // PM Kisan
      { source: '/api/pm-kisan', destination: `${BACKEND_URL}/pm-kisan/status` },
      // Profile
      { source: '/api/profile/:path*', destination: `${BACKEND_URL}/profile/:path*` },
      // Form scanner
      { source: '/api/form-scanner/:path*', destination: `${BACKEND_URL}/form-scanner/:path*` },
      // Eligibility
      { source: '/api/eligibility/:path*', destination: `${BACKEND_URL}/eligibility/:path*` },
      // Renewals
      { source: '/api/renewals/:path*', destination: `${BACKEND_URL}/renewals/:path*` },
      // Portals
      { source: '/api/portals/:path*', destination: `${BACKEND_URL}/portals/:path*` },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 2: Update `frontend/.env.local`**

```
NEXT_PUBLIC_SUPABASE_URL=https://abduwpzlnhhlsjxsnldn.supabase.co
NEXT_PUBLIC_SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiZHV3cHpsbmhobHNqeHNubGRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzOTQxODUsImV4cCI6MjA4ODk3MDE4NX0.pSt1JWbGa89UQJMBlFFj1poMdvEw0YAwWqP53guEDts
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_FRONTEND_URL=https://govbot-fawn.vercel.app
```

- [ ] **Step 3: Commit**

```bash
git add frontend/next.config.ts frontend/.env.local
git commit -m "fix: add API rewrites to proxy frontend calls to FastAPI backend"
```

---

### Task 2: Fix Login Flow

**Files:**
- Modify: `frontend/pages/login.tsx`

- [ ] **Step 1: Fix the dummy-token-fallback and add response validation**

Replace lines 58-74 of `login.tsx`:

```typescript
const handleVerifyOtp = async (e: React.FormEvent) => {
  e.preventDefault();
  setError('');
  setLoading(true);

  try {
    const res = await fetch('/api/verify-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, otp }),
    });

    const data = await res.json();

    if (!res.ok || !data.valid) {
      throw new Error(data.error || 'Invalid OTP. Please try again.');
    }

    if (!data.token) {
      throw new Error('Authentication failed. Please try again.');
    }

    localStorage.setItem('govbot_token', data.token);
    localStorage.setItem('govbot_phone', phone);

    router.push('/dashboard');
  } catch (err: any) {
    setError(err.message || 'OTP verification failed. Please check the code and try again.');
  } finally {
    setLoading(false);
  }
};
```

- [ ] **Step 2: Add token-param auto-login for QR handoff**

Add this useEffect after the existing one (around line 17):

```typescript
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const ph = params.get('phone');
  if (token && ph) {
    localStorage.setItem('govbot_token', token);
    localStorage.setItem('govbot_phone', ph);
    router.push('/dashboard');
  }
}, [router]);
```

- [ ] **Step 3: Commit**

```bash
git add frontend/pages/login.tsx
git commit -m "fix: remove dummy-token-fallback, validate OTP response, add QR auto-login"
```

---

### Task 3: Fix Dashboard Supabase Key + Add Live Activity Card

**Files:**
- Modify: `frontend/pages/dashboard.tsx`

- [ ] **Step 1: Fix the Supabase key env var name**

Change line 14 from:
```typescript
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
```
To:
```typescript
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY || '';
```

- [ ] **Step 2: Add live activity feed component below the applications list**

Add this state and effect after the existing useEffect (around line 73):

```typescript
const [activities, setActivities] = useState<{event: string; timestamp: string}[]>([]);

useEffect(() => {
  const phone = localStorage.getItem('govbot_phone');
  if (!phone) return;

  const fetchActivities = async () => {
    try {
      const res = await fetch(`/api/live/feed/${encodeURIComponent(phone)}`);
      if (res.ok) {
        const data = await res.json();
        setActivities(data.events || []);
      }
    } catch {}
  };

  fetchActivities();
  const interval = setInterval(fetchActivities, 3000);
  return () => clearInterval(interval);
}, []);
```

Add this JSX block after the applications list section (inside the return):

```tsx
{/* Live Activity Feed */}
{activities.length > 0 && (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className="mt-8 bg-white rounded-2xl border border-slate-100 shadow-sm p-6"
  >
    <div className="flex items-center gap-2 mb-4">
      <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
      <h3 className="font-semibold text-slate-900">Live Activity</h3>
      <span className="text-xs text-slate-400">from WhatsApp Bot</span>
    </div>
    <div className="space-y-3 max-h-64 overflow-y-auto">
      {activities.map((a, i) => (
        <div key={i} className="flex items-start gap-3 text-sm">
          <span className="text-slate-400 text-xs whitespace-nowrap">
            {new Date(a.timestamp).toLocaleTimeString()}
          </span>
          <span className="text-slate-700">{a.event}</span>
        </div>
      ))}
    </div>
  </motion.div>
)}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/pages/dashboard.tsx
git commit -m "fix: correct Supabase key env var, add live activity feed from bot"
```

---

### Task 4: Add Activity Feed Backend

**Files:**
- Modify: `gov_agent/live_router.py`

- [ ] **Step 1: Add activity feed endpoints to `live_router.py`**

Append to the end of `gov_agent/live_router.py`:

```python
class ActivityEvent(BaseModel):
    phone: str
    event: str


@router.post("/event")
async def post_activity_event(body: ActivityEvent):
    """Store a bot activity event for the live feed."""
    try:
        supabase.table("activity_feed").insert({
            "phone": body.phone,
            "event": body.event,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    except Exception as e:
        logger.warning("activity_feed insert failed: %s", e)
    return {"ok": True}


@router.get("/feed/{phone}")
async def get_activity_feed(phone: str):
    """Get recent activity events for a phone (last 20)."""
    try:
        resp = supabase.table("activity_feed").select("*").eq(
            "phone", phone
        ).order("created_at", desc=True).limit(20).execute()
        events = [
            {"event": r["event"], "timestamp": r["created_at"]}
            for r in (resp.data or [])
        ]
        return {"events": list(reversed(events))}
    except Exception as e:
        logger.warning("activity_feed fetch failed: %s", e)
        return {"events": []}
```

- [ ] **Step 2: Create the `activity_feed` table in Supabase**

Run this SQL in the Supabase dashboard:

```sql
CREATE TABLE IF NOT EXISTS activity_feed (
  id bigserial PRIMARY KEY,
  phone text NOT NULL,
  event text NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_activity_feed_phone ON activity_feed(phone, created_at DESC);
```

- [ ] **Step 3: Commit**

```bash
git add gov_agent/live_router.py
git commit -m "feat: add activity feed endpoints for live bot→web bridge"
```

---

### Task 5: Emit Activity Events from Bot Flow

**Files:**
- Modify: `gov_agent/flow_router.py`

- [ ] **Step 1: Add helper to emit activity events**

Add after the `_save_profile_field` function (around line 60):

```python
async def _emit_activity(phone: str, event: str) -> None:
    """Push an activity event to the live feed."""
    try:
        supabase.table("activity_feed").insert({
            "phone": phone,
            "event": event,
            "created_at": __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),
        }).execute()
    except Exception:
        pass
```

- [ ] **Step 2: Sprinkle `_emit_activity` calls at key flow points**

In `state == "collect_name"` (around line 424), after `await _save_profile_field(...)`:
```python
await _emit_activity(msg.phone, "📝 Profile collection started")
```

In `state == "collect_income"` (around line 451), after `await _save_profile_field(...)`:
```python
await _emit_activity(msg.phone, f"💰 Income recorded: ₹{data['income']}")
```

In `state == "awaiting_document"` after OCR success (around line 487), before the return:
```python
await _emit_activity(msg.phone, f"📄 Document scanned: {ocr_result.get('doc_type', 'Aadhaar')}")
```

In `state == "awaiting_document"` after successful submission (around line 518), before the return:
```python
await _emit_activity(msg.phone, f"🎉 Application submitted! Confirmation: {conf}")
```

In `state == "form_fill_processing"` after successful fill (around line 383):
```python
await _emit_activity(msg.phone, f"🤖 Form auto-filled: {filled_count} fields completed")
```

- [ ] **Step 3: Commit**

```bash
git add gov_agent/flow_router.py
git commit -m "feat: emit activity events during bot flow for live web dashboard"
```

---

### Task 6: Add Passkey Gate for Sensitive Data

**Files:**
- Modify: `gov_agent/flow_router.py`

- [ ] **Step 1: Add passkey-related states to the route function**

Add these states inside the `route()` function, before the final fallback. Place after the `profile_update_*` states block (after line 334):

```python
# ── Passkey: Set passkey ──────────────────────────────────────────────
elif state == "set_passkey":
    pin = body.strip()
    if not pin.isdigit() or len(pin) != 4:
        return ("❌ Enter a 4-digit PIN only.", "set_passkey", data)
    await _save_profile_field(msg.phone, "passkey", pin)
    await _emit_activity(msg.phone, "🔐 Security passkey set")
    return (
        "✅ Passkey set! You'll need this to view sensitive data.\n\n" + MENU,
        "greeting",
        data,
    )

# ── Passkey: Verify before revealing data ─────────────────────────────
elif state == "passkey_verify":
    pin = body.strip()
    profile = await _load_profile(msg.phone)
    stored_pin = profile.get("passkey", "")
    if pin != stored_pin:
        return ("❌ Wrong passkey. Try again:", "passkey_verify", data)
    # Reveal the requested field
    field = data.get("_reveal_field", "")
    value = profile.get(field, "Not available")
    await _emit_activity(msg.phone, f"🔓 Sensitive data accessed: {field}")
    data.pop("_reveal_field", None)
    return (
        f"🔓 Your {field.replace('_', ' ').title()}: *{value}*\n\n"
        "This message will not be stored. Type 'Hi' for menu.",
        "greeting",
        data,
    )
```

- [ ] **Step 2: Add intent detection for "what's my PAN/Aadhaar/etc" queries**

Add at the top of the `route()` function, right after the `_EXIT_KEYWORDS` check (around line 91):

```python
# ── Sensitive data query: "whats my pan", "my aadhaar", etc. ──────────
_SENSITIVE_PATTERNS = {
    "pan": "pan_number",
    "aadhaar": "aadhaar_number",
    "bank": "bank_account",
    "account": "bank_account",
    "ifsc": "bank_ifsc",
}
for keyword, field in _SENSITIVE_PATTERNS.items():
    if keyword in body_lower and ("my" in body_lower or "what" in body_lower or "show" in body_lower):
        profile = await _load_profile(msg.phone)
        if not profile.get("passkey"):
            data["_reveal_field"] = field
            return (
                "🔐 First, set a 4-digit security passkey to protect your data:",
                "set_passkey",
                {**data, "_reveal_field": field, "_after_passkey": "reveal"},
            )
        data["_reveal_field"] = field
        return ("🔐 Enter your 4-digit passkey:", "passkey_verify", data)
```

- [ ] **Step 3: Also prompt passkey setup after onboarding completes**

In the successful submission return (around line 518), add a passkey prompt if not set:

After the `conf` check, before returning, add:
```python
profile = await _load_profile(msg.phone)
passkey_hint = ""
if not profile.get("passkey"):
    passkey_hint = "\n\n🔐 Set a passkey to protect your data. Reply SET PIN"
```

And include `passkey_hint` in the reply string.

- [ ] **Step 4: Add "SET PIN" keyword handler**

Add after the "update profile" keyword block (around line 92):

```python
if body_lower in {"set pin", "set passkey", "change pin", "change passkey"}:
    return ("🔐 Enter a 4-digit security PIN:", "set_passkey", data)
```

- [ ] **Step 5: Add `passkey` column to Supabase `citizen_profiles`**

```sql
ALTER TABLE citizen_profiles ADD COLUMN IF NOT EXISTS passkey text;
```

- [ ] **Step 6: Commit**

```bash
git add gov_agent/flow_router.py
git commit -m "feat: add 4-digit passkey gate for sensitive data in WhatsApp bot"
```

---

### Task 7: Bot Sends Web Links After Key Actions

**Files:**
- Modify: `gov_agent/config.py`
- Modify: `gov_agent/flow_router.py`

- [ ] **Step 1: Add FRONTEND_URL to config.py**

Add after line 59 in `config.py`:

```python
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://govbot-fawn.vercel.app")
```

- [ ] **Step 2: Update bot replies to include web links**

The existing code already sends `govbot.vercel.app/track/{conf}` and `govbot.vercel.app/dashboard` in the submission confirmation (line 522-524 of flow_router.py). Update these to use the config variable:

Replace hardcoded `govbot.vercel.app` references with `{FRONTEND_URL}` throughout `flow_router.py`. At the top imports, add:
```python
from gov_agent.config import FRONTEND_URL
```

Then replace all instances of `govbot.vercel.app` with `{FRONTEND_URL}` in f-strings. Key locations:
- Line 105: `f"🌐 Complete your profile: {FRONTEND_URL}/profile\n"`
- Line 117: `f"🌐 Or use the web tool: {FRONTEND_URL}/form-fill"`
- Line 147: `f"🌐 Or use the web tool: {FRONTEND_URL}/form-fill"`
- Line 344: `f"{FRONTEND_URL}/profile\n\n"`
- Line 352: `f"🌐 For live status: {FRONTEND_URL}/form-fill\n\n"`
- Line 384: `f"📸 Screenshot: {FRONTEND_URL}/form-fill\n"`
- Line 416: `f"📸 Screenshot: {FRONTEND_URL}/form-fill\n"`
- Line 435: `f"{FRONTEND_URL}/nsp?session={session_id}"`
- Line 522: `f"{FRONTEND_URL}/track/{conf}\n\n"`
- Line 524: `f"{FRONTEND_URL}/dashboard"`

- [ ] **Step 3: After submission, also send a wallet link**

In the successful submission return (line 518-525), add:
```python
f"📋 Documents & Credentials:\n"
f"{FRONTEND_URL}/wallet\n\n"
```

- [ ] **Step 4: Commit**

```bash
git add gov_agent/config.py gov_agent/flow_router.py
git commit -m "feat: use FRONTEND_URL config for all bot→web links"
```

---

### Task 8: QR Code Login from Bot

**Files:**
- Create: `gov_agent/qr_login.py`
- Modify: `gov_agent/flow_router.py`
- Modify: `gov_agent/whatsapp_sender.py`

- [ ] **Step 1: Create `gov_agent/qr_login.py`**

```python
import io
import base64
import jwt
from datetime import datetime, timezone, timedelta
from gov_agent.config import SECRET_KEY, FRONTEND_URL

def generate_login_qr(phone: str) -> str:
    """Generate a QR code image (base64) with a short-lived login URL."""
    token = jwt.encode(
        {"phone": phone, "exp": datetime.now(timezone.utc) + timedelta(hours=2)},
        SECRET_KEY,
        algorithm="HS256",
    )
    url = f"{FRONTEND_URL}/login?token={token}&phone={phone}"

    try:
        import qrcode
        qr = qrcode.make(url)
        buf = io.BytesIO()
        qr.save(buf, format="PNG")
        buf.seek(0)
        return base64.b64encode(buf.read()).decode()
    except ImportError:
        return ""


def get_login_url(phone: str) -> str:
    """Generate just the login URL (no QR image)."""
    token = jwt.encode(
        {"phone": phone, "exp": datetime.now(timezone.utc) + timedelta(hours=2)},
        SECRET_KEY,
        algorithm="HS256",
    )
    return f"{FRONTEND_URL}/login?token={token}&phone={phone}"
```

- [ ] **Step 2: Add `send_image` to `whatsapp_sender.py`**

Append to `gov_agent/whatsapp_sender.py`:

```python
async def send_image(to: str, image_base64: str, caption: str = "") -> bool:
    """Send a base64-encoded image via WhatsApp."""
    url = f"https://graph.facebook.com/v18.0/{WHATSAPP_PHONE_NUMBER_ID}/messages"
    headers = {
        "Authorization": f"Bearer {WHATSAPP_TOKEN}",
        "Content-Type": "application/json",
    }

    # WhatsApp requires uploaded media or a public URL.
    # For demo: send as a document with caption, or fallback to link.
    # Simplest: just send the login URL as text.
    logger.info("send_image called — falling back to text link for demo")
    return await send_message(to, caption)
```

- [ ] **Step 3: Add "open web" / "dashboard" keyword to flow_router.py**

Add after the "set pin" keyword handler:

```python
if body_lower in {"web", "open web", "dashboard", "open dashboard", "website"}:
    from gov_agent.qr_login import get_login_url
    login_url = get_login_url(msg.phone)
    await _emit_activity(msg.phone, "🌐 Web dashboard link generated")
    return (
        f"🌐 *Open GovBot Web Dashboard*\n\n"
        f"Click to open (auto-login):\n{login_url}\n\n"
        f"📱 Or scan this link from another device.\n"
        f"Link expires in 2 hours.",
        "greeting",
        data,
    )
```

- [ ] **Step 4: Add `qrcode` and `PyJWT` to requirements.txt if not present**

Check and add:
```
qrcode[pil]
PyJWT
```

- [ ] **Step 5: Commit**

```bash
git add gov_agent/qr_login.py gov_agent/whatsapp_sender.py gov_agent/flow_router.py requirements.txt
git commit -m "feat: add QR/link-based web login handoff from WhatsApp bot"
```

---

### Task 9: Fix Wallet Page API Path

**Files:**
- Modify: `frontend/pages/wallet/index.tsx`

- [ ] **Step 1: Fix the fetch URL**

The wallet page calls `/api/credentials/${phone}` which will now correctly proxy via the rewrites in Task 1. No change needed if the rewrite is in place. Verify the rewrite covers it:

Rewrite line: `{ source: '/api/credentials/:path*', destination: '${BACKEND_URL}/api/credentials/:path*' }`

This matches because the backend registers `credentials_router` at prefix `/api` and the route is `/credentials/{phone}`. Full path: `/api/credentials/{phone}`. The rewrite maps `/api/credentials/:path*` → backend `/api/credentials/:path*`. ✅ No code change needed.

- [ ] **Step 2: Add login redirect for unauthenticated users**

Replace lines 34-37:
```typescript
if (!phone) {
  setError('Please login first');
  setLoading(false);
  return;
}
```
With:
```typescript
if (!phone) {
  window.location.href = '/login';
  return;
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/pages/wallet/index.tsx
git commit -m "fix: redirect to login if unauthenticated on wallet page"
```

---

### Task 10: Fix Remaining Frontend Pages Using Wrong Env Var

**Files:**
- Modify: `frontend/pages/eligibility.tsx`
- Modify: `frontend/pages/track/[id].tsx`
- Modify: `frontend/pages/renewals.tsx`

- [ ] **Step 1: Update all pages that use `NEXT_PUBLIC_API_URL` or `NEXT_PUBLIC_RAILWAY_URL`**

Since we now have rewrites, these pages should use relative URLs (like `/api/...`) or use `NEXT_PUBLIC_API_URL` consistently. The simplest fix: change all `API_BASE` declarations to:

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
```

But actually, with rewrites in place, the cleanest approach for the demo is to use relative paths. However, some of these pages call the backend directly (not via `/api/` prefix). 

For pages that call the backend directly (e.g., `${API_BASE}/eligibility/check`), standardize the env var:

In `eligibility.tsx` — change:
```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
```
This is already correct. Just ensure the var is in `.env.local` (done in Task 1).

In `track/[id].tsx` — same pattern, already uses `NEXT_PUBLIC_API_URL`.

In `renewals.tsx` — same pattern.

In `dashboard.tsx` — change line 11 from:
```typescript
const API_BASE = process.env.NEXT_PUBLIC_RAILWAY_URL || 'http://localhost:8000';
```
To:
```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
```

In `profile.tsx` and `form-fill.tsx` — find `NEXT_PUBLIC_RAILWAY_URL` references and change to `NEXT_PUBLIC_API_URL`.

- [ ] **Step 2: Commit**

```bash
git add frontend/pages/eligibility.tsx frontend/pages/track/[id].tsx frontend/pages/renewals.tsx frontend/pages/dashboard.tsx frontend/pages/profile.tsx frontend/pages/form-fill.tsx
git commit -m "fix: standardize all pages to use NEXT_PUBLIC_API_URL env var"
```

---

### Task 11: Update Bot Menu to Show New Features

**Files:**
- Modify: `gov_agent/flow_router.py`

- [ ] **Step 1: Update MENU to include new capabilities**

Replace the `MENU` constant:

```python
MENU = (
    "🙏 Namaste! GovBot - Govt Services\n\n"
    "1️⃣ Apply for Scholarship\n"
    "2️⃣ Check Application Status\n"
    "3️⃣ Check My Eligibility\n"
    "4️⃣ PM Kisan Status\n"
    "5️⃣ Auto-Fill Any Form\n\n"
    "💡 *Other commands:*\n"
    "• 'profile' — View/update profile\n"
    "• 'set pin' — Set security passkey\n"
    "• 'my pan' / 'my aadhaar' — View docs (passkey needed)\n"
    "• 'web' — Open web dashboard\n\n"
    "Reply with 1-5 or a command above"
)
```

- [ ] **Step 2: Commit**

```bash
git add gov_agent/flow_router.py
git commit -m "feat: update bot menu to show passkey and web commands"
```

---

### Task 12: Quick Smoke Test

- [ ] **Step 1: Start the backend**

```bash
cd /home/user/GOVbot && python -m gov_agent.main
```

Verify: health endpoint returns OK at `http://localhost:8000/govbot/health`

- [ ] **Step 2: Start the frontend**

```bash
cd /home/user/GOVbot/frontend && npm run dev
```

Verify:
- `http://localhost:3000/login` loads without errors
- `http://localhost:3000/dashboard` redirects to login (no token)
- `http://localhost:3000/eligibility` loads and can submit
- `http://localhost:3000/wallet` redirects to login

- [ ] **Step 3: Test WhatsApp bot**

Send "Hi" to the bot number → should get the updated menu.
Send "web" → should get a login URL link.
Send "set pin" → should prompt for 4-digit PIN.

- [ ] **Step 4: Final commit if any test-driven fixes needed**

```bash
git add -A && git commit -m "fix: smoke test adjustments"
```

---

## Execution Order Summary

| Task | What | Time Est. |
|------|------|-----------|
| 1 | API Proxy (rewrites) | 10 min |
| 2 | Fix login flow | 10 min |
| 3 | Fix dashboard + live activity UI | 15 min |
| 4 | Activity feed backend | 10 min |
| 5 | Emit events from bot | 10 min |
| 6 | Passkey gate | 20 min |
| 7 | Bot web links | 10 min |
| 8 | QR/link login | 15 min |
| 9 | Fix wallet page | 5 min |
| 10 | Fix env vars across pages | 10 min |
| 11 | Update bot menu | 5 min |
| 12 | Smoke test | 15 min |
| **Total** | | **~2.5 hours** |
