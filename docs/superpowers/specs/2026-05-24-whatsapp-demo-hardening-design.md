# WhatsApp Demo Hardening Design

## Goal

Harden the GOVbot WhatsApp experience for a 4-6 minute hackathon demo where WhatsApp is the entry point and the web dashboard is part of the core story.

The outcome should be:
- one reliable end-to-end WhatsApp-to-web showcase,
- a small set of side branches that can survive judge follow-up questions,
- a clear rule for what is in scope before the demo and what is not.

## Chosen Strategy

Use a balanced hardening approach:
- lock down the main demo path first,
- then harden the most likely side branches,
- avoid spending time on low-value branches that do not support the live story.

This is intentionally not a broad product cleanup. The implementation should optimize for demo reliability, explicit recovery prompts, and predictable transitions between WhatsApp and web.

## Approved Demo Scope

### Core story

The core live story is:

1. User starts in WhatsApp.
2. User applies for `NSP` scholarship.
3. User completes manual intake or a pre-validated DigiLocker branch.
4. User uploads Aadhaar and confirms OCR output.
5. User completes bank verification.
6. User receives a submission confirmation.
7. User opens the public track link.
8. User opens the authenticated dashboard handoff link.
9. Dashboard shows the submitted application and current counters.

### Side features ready if asked

These should be stable enough for short follow-up demonstrations:
- eligibility flow from menu `3`,
- PM-Kisan flow from menu `4`,
- passkey-protected `my aadhaar` / `my pan`,
- confirmation-number status lookup from menu `2`,
- one extra scholarship flow, with `PMSS` as the preferred secondary portal.

### Explicitly out of the main live path

These are not part of the core demo unless there is extra time:
- renewal reminder lifecycle,
- full chat-driven form-fill deep run,
- CSSS and Minority full-path polish,
- credential issuance and disbursement as live WhatsApp steps.

## Hardening Priorities

### Tier 1: Demo-critical

These flows must be reliable because they are part of the main story:
- menu entry and `restart`,
- NSP portal selection,
- manual entry path,
- Aadhaar OCR followed by `YES` / `NO`,
- bank verification success path,
- submission success reply,
- public track link,
- dashboard handoff link,
- confirmation-number status lookup.

### Tier 2: Side-branch hardening

These branches should be stable for judge follow-up questions:
- DigiLocker `YES -> auth -> CHECK -> continue`,
- eligibility screener,
- PM-Kisan lookup,
- passkey-protected sensitive-data retrieval,
- PMSS application flow,
- explicit handling for unknown upload commands and wrong passkeys,
- clear retry/recovery prompts for invalid IFSC, invalid bank account, and invalid step input.

### Deferred work

These should only be touched if Tier 1 and Tier 2 are already stable:
- renewal summary and reminder edge cases,
- full chat-side form-fill automation polish,
- CSSS and Minority full end-to-end tightening,
- credential/disbursement WhatsApp narration.

## Component-Level Design

### WhatsApp router

Primary implementation focus stays in `gov_agent/flow_router.py`.

Responsibilities:
- preserve exact state transitions for the core demo path,
- avoid silent menu fallbacks when a branch-specific error should be shown,
- keep completion, retry, and restart behavior explicit,
- preserve clear handoff messages into web links.

### Session and state persistence

The WhatsApp session state remains anchored in the existing session/profile/application tables.

The hardening pass should treat these as the current sources of truth:
- `sessions` for conversational state,
- `citizen_profiles` for persistent citizen data,
- `applications` for submitted scholarship records,
- `activity_feed` for dashboard-visible activity,
- `user_documents`, `ocr_extractions`, and `document_checks` for document handling,
- `bank_verifications` for verification records.

No new state model is required unless a specific broken transition cannot be fixed within the current model.

### Web handoff

The demo depends on two reliable handoffs:
- public track route for a submitted confirmation number,
- authenticated dashboard login link that resolves to the correct phone and dashboard state.

Implementation should preserve:
- one-click open from WhatsApp,
- no false `Application not found` responses for valid confirmations,
- no zero-state dashboard caused by missing phone context in the handoff.

## Data Flow

### Core demo path

1. User sends `Hi`.
2. Router returns menu.
3. User selects `1` then `1` for `NSP`.
4. Router branches into DigiLocker offer or manual intake.
5. Manual path collects name, DOB, income, then document upload.
6. Aadhaar image triggers OCR extraction.
7. User confirms OCR output.
8. Router collects IFSC and account number.
9. Bank verification runs immediately.
10. Successful verification triggers application submission.
11. Submission persists an `applications` row and emits activity.
12. Reply includes confirmation number, track link, and dashboard handoff link.
13. Track page reads application timeline.
14. Dashboard reads application list and activity list for the logged-in phone.

### Side branches

- DigiLocker path should prefill application data and continue into the same downstream submission path.
- Eligibility should end with either a clean “not eligible” result or a transition into application flow.
- PM-Kisan should either validate input and return status guidance or fail with a clear input error.
- Passkey retrieval should either reveal data after a correct PIN or loop with a clear wrong-passkey response.

## Error Handling Expectations

The hardening pass should enforce these rules:

- No hidden dead states that only recover on a random next inbound message.
- No branch-specific failure should silently dump the user back to the greeting menu unless the menu itself is the intended recovery.
- Unknown upload variants should produce an explicit command-help response.
- OCR rejection should clearly ask for re-upload.
- Bank verification failure should always offer a defined next action such as `RETRY` or `CONTINUE`.
- DigiLocker waiting state should always allow `CHECK` or `SKIP`.
- Completed flows should preserve a simple `restart` path.

When a branch cannot continue, the response must tell the user exactly what to do next.

## Live Demo Workflow

### Primary 4-6 minute script

1. Send `Hi`.
2. Briefly show menu breadth.
3. Send `1`.
4. Send `1` for `NSP`.
5. Prefer `NO` for the manual path unless DigiLocker was pre-validated just before the demo.
6. Enter name, DOB, and income.
7. Upload Aadhaar.
8. Let OCR extract fields.
9. Reply `YES`.
10. Enter IFSC and account number.
11. Receive confirmation number.
12. Open track link.
13. Open dashboard link.
14. Show `Total 1`, `Submitted 1`, and the new application row.

### Optional judge follow-ups

If asked to show more:
- send `3` for eligibility,
- send `my aadhaar` and enter passkey,
- send `2` and look up a confirmation number,
- show one secondary portal path, with `PMSS` preferred.

### Operator rule

Default to the manual NSP path unless the DigiLocker branch has been tested immediately before the presentation.

Do not live-improvise into low-priority branches unless the core story has already landed cleanly.

## Verification Standard

Before the hackathon demo, the implementation should meet this bar:

- focused router/unit coverage for all hardened Tier 1 and Tier 2 branches,
- one clean manual WhatsApp pass for the main NSP story,
- one manual pass each for:
  - DigiLocker continuation,
  - eligibility,
  - PM-Kisan,
  - passkey retrieval,
  - PMSS submission,
- a full tester reset immediately before the final showcase run,
- no more behavior changes after final validation unless a demo-critical bug is found.

## Success Criteria

This design is successful if:
- the main 4-6 minute WhatsApp-to-web story completes without manual intervention,
- the user receives a real confirmation number and usable links,
- the track page resolves the submitted application,
- the dashboard shows the correct application count and submitted row,
- side branches respond with either a valid result or a clear recovery prompt,
- the demo operator can stay within a predictable script instead of debugging live.

## Non-Goals

- Full production hardening of every WhatsApp branch.
- New product scope beyond the current demo surfaces.
- A redesign of the overall router architecture unless a targeted change is necessary to stabilize a broken branch.
- Turning every secondary feature into part of the live demo.
