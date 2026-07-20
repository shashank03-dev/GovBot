# GovBot — Hackathon Pitch Script (4 speakers, ~5 minutes)

**Tagline to open and close on:** "Government services, from paper trail to proof trail."

## Before you walk on stage (setup checklist)

- Backend running (`make dev`) and frontend open on the big screen. Have `http://localhost:3000` ready.
- Log in once beforehand as the seeded citizen **Shashank Gowda T** so the profile, documents, and wallet are already populated. Do not do a fresh OTP live unless your OTP delivery is reliable in the room.
- Open these tabs in order so you only switch tabs, never type URLs on stage:
  1. `/` (landing)
  2. `/services` (hub)
  3. `/documents` (vault, already unlocked or with passkey ready)
  4. `/eligibility`
  5. `/ssp` (State Scholarship Portal flow)
  6. `/form-fill`
  7. `/wallet` and one `/verify/[id]` proof page
  8. `/gov-dashboard` (already logged in as official)
- One phone with WhatsApp open on the GovBot number, mirrored to screen if possible.
- If Wi-Fi is shaky, everything below still works — the demo data is seeded locally.

**Honesty line you can lean on any time a judge probes:** the app itself shows an "Integration Mode" banner. Say plainly: *"For the demo these run in sandbox mode with mock DigiLocker, NPCI, and blockchain providers. The integration points are wired — swapping in production keys is a config change, not a rewrite."* That is the truth and it disarms the "is this real?" question instantly.

---

## SPEAKER 1 — The problem and the promise (~60 sec)
*Stand at the landing page `/`. Do not click yet. Talk first.*

> "Think about the last time you applied for anything from the government. A scholarship, a subsidy, a certificate. You typed the same name, the same address, the same income into five different portals. You uploaded the same Aadhaar four times. And after you hit submit, the status just... vanished.
>
> That is the problem. Not one broken form. The whole runaround. Citizens start over every single time, and officers only ever see fragments.
>
> We built GovBot to cut that. It is a WhatsApp-first assistant for public services. You onboard once, store your documents once, and that same profile carries you through every scheme, every form, and every proof after approval."

*Now gesture at the screen.*

> "This is the front door. Same journey whether you start on WhatsApp or the web. Let me hand over to show you how a citizen actually moves through it."

**[NAV]** Click **Explore Services** → lands on `/services`. Hand mic to Speaker 2.

---

## SPEAKER 2 — The citizen journey: entry, profile, vault (~90 sec)
*You are on `/services`. This is the hub.*

> "This is the services hub. One workspace. Scholarships, eligibility, PM-KISAN, document tools, tracking, verification. A citizen doesn't hunt across ten websites anymore.
>
> But most people in India don't start on a website. They start on WhatsApp."

**[DEMO — WhatsApp]** Hold up the phone. Send `Hi` to the GovBot number. The menu replies.

> "That's it. No app install. The citizen texts 'Hi', gets a menu, and can check schemes, upload a document, or type 'web' to jump to the dashboard. Behind this is our FastAPI backend running the conversation flow, with an OTP-backed session so the phone number is the login."

**[DEMO NOTE]** If WhatsApp is slow in the room, skip the live send and just say the two lines above while showing the phone. Do not wait on the network.

**[NAV]** Switch to the web tab. Go to `/profile` (or open dashboard).

> "Once verified, the citizen has one reusable profile. Name, address, income, category — saved once. See this completeness bar? Every form after this reuses these fields instead of asking again. This is the 'type it once' promise, made real."

**[NAV]** Switch to the `/documents` tab.

> "Now the vault. Aadhaar, PAN, income certificate, marksheets — all stored behind a four-digit passkey."

**[DEMO]** If the passkey gate shows, enter the PIN live — it looks great on screen.

> "Notice we mask the sensitive numbers by default. The full document only opens behind the passkey, and every access is logged. This is a document vault with signed links and an audit trail, not a folder of screenshots in someone's chat."

**[DEMO — DigiLocker / OCR]** Trigger the DigiLocker or OCR prefill for the seeded citizen.

> "And we don't make people type document data either. This pulls straight from DigiLocker, and for anything scanned, our OCR reads it. Watch — it just extracted this income and caste certificate: name, father's name, annual income, category. That's OCR plus DigiLocker doing the data entry."

**[DEMO NOTE]** This uses the seeded citizen **Shashank Gowda T** (real certificate fields, 95.5% marksheet). If a judge asks, that is the "Integration Mode" sandbox line — say it and move on. Hand to Speaker 3.

---

## SPEAKER 3 — Deciding and applying: eligibility, portal, auto-fill, tracking (~100 sec)
*Switch to the `/eligibility` tab.*

> "Okay — the citizen is onboarded and their documents are in. Now the real question: what am I even eligible for? Scheme rules are a maze. We turn the maze into a map."

**[DEMO]** Walk the 4-step eligibility form quickly (income, category, course). Reach the result.

> "Four quick questions — most of it already known from the profile — and it tells you exactly which schemes you qualify for."

**[DEMO NOTE]** When the citizen is eligible, the page fires a **confetti animation**. Let it land, it's a nice moment. Say: "and yes, we celebrate the good news."

**[NAV]** Switch to the `/ssp` tab (State Scholarship Portal).

> "Say they qualify for a scholarship. Normally that means the State Scholarship Portal — a five-step government form. We rebuilt that flow inside GovBot, bilingual, in English and Kannada."

**[DEMO]** Toggle the language switch English ↔ Kannada on the SSP page. Step through a couple of steps.

> "Same portal, same steps, but guided — and every field is pre-filled from the profile and the vault. The citizen is confirming data, not re-entering it. We have the same for the National Scholarship Portal, CSSS, and the Minority scholarship."

**[NAV]** Switch to the `/form-fill` tab.

> "And for any government form we haven't hand-built, there's this. The generic form-fill. You give it a form, and our backend maps the citizen's saved data onto that form's fields using Gemini for the field mapping, then a Playwright browser fills it automatically."

**[DEMO]** Run the analyze/fill on one of the sample targets. Show the filled-count result.

> "That's browser automation actually completing the form. This is the piece that scales — one saved profile, mapped onto forms we've never seen."

**[NAV]** Switch to `/track-search` (or `/track/[id]`).

> "And critically — after submit, the status does not vanish. Confirmation number goes in, and the citizen sees a live timeline of where the application is. No more calling an office to ask 'what happened to my form.'"

Hand to Speaker 4.

---

## SPEAKER 4 — The trust layer and the officer side (~100 sec)
*Switch to the `/bank-verify` tab.*

> "Now the part everyone forgets. Money and proof.
>
> Before a payout goes out, the bank account has to be verified. This is our bank verification, running through the NPCI flow — it confirms the account is real and payout-ready before a single rupee moves."

**[DEMO]** Run the bank verify. There's a short simulated delay, then a success state.

**[DEMO NOTE]** NPCI verification and the scholarship credit are **simulated in the demo** (mock provider, a deliberate short delay so it feels real). If asked: "sandbox NPCI, production keys drop in." Do not over-claim a live bank hit.

**[NAV]** Switch to the `/wallet` tab.

> "Once a scholarship is approved and credited, the citizen gets a credential. This is the wallet — every credential they've earned, with the amount, the date, and a verifiable proof link."

**[NAV]** Open one credential's `/verify/[id]` QR proof page.

> "And here's the proof page. Anyone — a college, an officer, a bank — can scan this QR and verify the credential is genuine. The credential is anchored on-chain, on Polygon, with a transaction hash you can open in the explorer. So proof doesn't end at 'application received.' It's a credential the citizen carries forward."

**[DEMO NOTE]** Blockchain issuance is the Polygon/IPFS hook — sandbox in the demo. The transaction hash and explorer link are the integration points. Same honesty line if pressed.

**[NAV]** Switch to the `/gov-dashboard` tab (already logged in as official).

> "That's the citizen's whole journey. But GovBot has a second face — the officer's.
>
> This is the government dashboard. One screen instead of fragments. Total applications, total disbursed, pending payouts, and fraud flags — all live."

**[DEMO]** Point at the animated counters and the status breakdown. Click into one sub-view.

> "Officers can drill into disbursements — what's queued for the next payment run. Into the fraud view — suspicious applications and duplicate documents, with Aadhaar masked even here. And into regional performance, to see which districts are moving and which are stuck.
>
> Same data that serves the citizen, turned into an operational picture for the people who run the scheme."

*Step back. Deliver the close slowly.*

> "So — that's GovBot. A citizen onboards once on WhatsApp, stores documents once, checks eligibility, applies through guided portals with auto-filled forms, tracks it live, gets paid after a verified bank check, and walks away with a credential they can prove with a QR code. And every step of that is visible to the officer on one dashboard.
>
> Government services, from paper trail to proof trail. Thank you."

---

## Timing map (target ~5 min, overrun is fine)

| Speaker | Segment | Target |
| --- | --- | --- |
| 1 | Problem + landing | 60s |
| 2 | WhatsApp, profile, vault, OCR/DigiLocker | 90s |
| 3 | Eligibility, SSP portal, form-fill, tracking | 100s |
| 4 | Bank verify, wallet/QR, officer dashboards, close | 100s |

## If you have less time (3-minute cut)
Drop the WhatsApp live send (just describe it), skip form-fill, and go: landing → vault+OCR → SSP prefill → wallet/QR proof → gov-dashboard → close.

## Q&A ammo (keep short)
- **"Is this real or mocked?"** → "Citizen flow is fully built. DigiLocker, NPCI, and blockchain run in sandbox for the demo — the integration points are wired, production keys are a config swap. The app even labels it 'Integration Mode.'"
- **"Why WhatsApp?"** → "Reach. No install, no literacy barrier, it's the app people already use."
- **"What's the hard tech?"** → "OCR extraction, Gemini field-mapping onto arbitrary forms, Playwright browser automation actually filling them, and QR-verifiable credentials anchored on Polygon."
- **"Data safety?"** → "Passkey-gated vault, masked sensitive numbers, signed links, and an access audit trail."
