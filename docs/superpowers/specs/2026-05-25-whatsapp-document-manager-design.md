# WhatsApp Document Manager Design

Date: 2026-05-25
Repo: GOVbot
Status: Draft for user review

## Summary

Add a production-ready WhatsApp document manager that supports the full document lifecycle from chat:

- upload
- list
- retrieve/view/send
- edit
- replace file
- delete

This applies to both built-in vault documents and custom documents, with stronger protection for sensitive built-in documents such as PAN and Aadhaar. The experience should work through both guided menus and direct commands. Minor command typos should be accepted when there is one clear intended match. Unknown or ambiguous commands should not be guessed.

## Goals

- Let users manage vault documents fully from WhatsApp without being forced into the web vault.
- Keep the web vault as a fallback and deep-link target, not the only document-management surface.
- Reduce passkey friction by unlocking protected document actions for a short active session after one successful verification.
- Support power users with direct commands while preserving a guided menu flow for everyone else.
- Keep command matching deterministic and safe enough for production use.

## Non-Goals

- Moving document storage or validation out of the current vault pipeline.
- Replacing the existing web vault UX.
- Using an LLM to decide security-sensitive command routing.
- Expanding the upload file format contract beyond the current supported image and PDF types.

## User Experience

### Entry Paths

Users can enter the feature through either direct commands or a guided menu.

Direct commands include examples such as:

- `documents`
- `my docs`
- `upload custom`
- `show my pan`
- `send aadhaar`
- `edit domicile certificate`
- `delete residence proof`

Guided flow starts when the user types `documents`. The bot replies with a compact document hub and available actions.

### Guided Hub

The hub should offer:

- View
- Upload
- Send
- Edit
- Delete
- Open Vault

The flow should keep users inside the document manager until they complete or cancel the current action.

### List and Selection

`my docs` and the guided `View` flow should return a compact numbered list of saved documents.

- Built-in documents should display masked summaries where needed.
- Custom documents should display the saved custom label and a short summary when available.
- If the user has multiple documents that match a request, the bot should ask for a number rather than guess.

### Upload

Upload should support:

- built-in documents such as PAN, Aadhaar, income certificate, caste certificate, and marksheet
- custom documents with a user-provided name

For `upload custom`, the flow is:

1. Ask for the document name.
2. Ask the user to send the file.
3. Save the file through the existing vault ingestion pipeline.
4. Confirm the saved document, status, and extracted summary details where available.

### Retrieve and Send

The existing signed-file delivery pattern should be reused:

- user requests a document
- bot verifies access or reuses the active unlock session
- bot returns the file link/media and a formatted details or summary response

### Edit

WhatsApp edit should support both:

- metadata edits
- file replacement

Metadata edits:

- built-in docs: update corrected extracted fields
- custom docs: update custom label and editable summary fields

File replacement:

- user selects the target document
- bot confirms replacement
- user sends a new file
- vault reprocesses the replacement

### Delete

Delete should always require an explicit confirmation step before removal.

The confirmation step must identify the target document clearly and should never rely on a fuzzy command alone.

## Security Model

### Sensitive Document Access

Built-in sensitive documents and any protected document action in WhatsApp should require the existing 4-digit passkey.

Protected actions include:

- view
- send
- edit
- replace file
- delete

### 10-Minute Active Unlock

After a successful passkey verification, the user gets temporary document access for the current WhatsApp session.

Rules:

- the unlock lasts for up to 10 minutes
- it expires early after inactivity
- each protected document action refreshes the last-activity timestamp
- session reset, exit, or inactivity expiration clears the unlock
- once expired, the next protected action asks for the passkey again

This behaves like: current active chat session, but no longer than 10 minutes of inactivity.

### Safety Requirements

- typo tolerance may route the user into a review or confirmation flow
- typo tolerance must never silently execute a destructive action
- ambiguous document matches must require explicit selection
- unknown commands must return a clear error and valid next options

## Command Recognition

### Normalization

Input matching should be deterministic:

- lowercase
- trim leading and trailing spaces
- collapse repeated internal spaces
- preserve existing aliases such as `aadhaar`, `aadhar`, and `adhaar`

### Typo Tolerance

The bot should accept minor typos only when there is one clear intended command.

Examples of acceptable near-matches:

- `documnts`
- `uplod custom`
- `delte pan`

Rules:

- accept only small edit-distance deviations against a known command phrase or action token
- prefer exact and alias matches first
- for destructive or state-changing commands, fuzzy matching may only route into a confirmable flow
- if confidence is low or more than one command/doc matches, do not guess

### Unknown Input

If the input is outside the safe matching threshold or does not map to a known action:

- return an error
- show the closest valid actions only when the match is high-confidence and non-destructive
- otherwise show the standard document command help

## Architecture

### Recommended Structure

Keep `gov_agent/flow_router.py` as the entry point, but move WhatsApp document-manager behavior into a focused helper module instead of continuing to expand the router inline.

Recommended responsibilities:

- `flow_router.py`
  - detect document manager entry intents
  - delegate document-specific state transitions and replies
- document manager helper/module
  - command parsing
  - guided menu rendering
  - document matching and selection
  - unlock validation and refresh
  - upload/edit/delete/send flows

This keeps the existing router as orchestration while isolating the growing document-management logic.

### Why This Structure

The feature scope now includes:

- command parsing
- list and selection flows
- unlock lifecycle
- metadata editing
- replacement uploads
- destructive confirmation flows

That is large enough that it should not be added as scattered `elif` branches in the router. A dedicated helper boundary is easier to test and safer to extend.

## Session and State Design

Reuse the existing `sessions` table and `collected_data` payload rather than introducing a new persistence mechanism.

Suggested session payload additions:

- current document action
- selected document id
- pending custom label
- pending edit field
- pending replacement target
- document candidate list for disambiguation
- `document_access_unlock`
  - `verified_at`
  - `last_activity_at`

The unlock object should be updated on successful passkey verification and refreshed on each protected document action.

## Data Handling Rules

### Built-In Documents

Built-in document replacement should continue using the existing latest-per-type model already enforced in the vault.

Edit operations should update corrected extracted data through the existing document update path.

### Custom Documents

Custom document replacement should target the selected record rather than create a disconnected duplicate when the user explicitly says to replace an existing document.

Custom edit should support:

- changing the custom label
- changing saved summary fields
- replacing the file while preserving the logical document selection

## Error Handling

### Matching Errors

- No matching document: tell the user nothing matched and offer upload or list actions.
- Ambiguous name: show a short numbered list and ask for a number.
- Unknown command: show an error and valid commands.

### Security Errors

- Wrong passkey: remain in the verification loop.
- Unlock expired: tell the user the secure session expired after inactivity and ask for the passkey again.

### File and Document Errors

- Unsupported or low-quality upload: keep the action active and ask for a clearer supported file.
- Missing document during edit/delete/send: tell the user the document is no longer available and refresh the flow.
- Failed replace/delete/update action: return a clear failure message and keep the user in the document flow.

## Testing Strategy

Add focused automated coverage for:

- guided `documents` menu entry
- direct command parsing
- typo-tolerant command acceptance
- explicit rejection of unknown commands
- list rendering with multiple custom documents
- name disambiguation flow
- passkey unlock reuse during active session
- unlock expiry after inactivity
- upload custom flow
- edit metadata flow
- replace-file flow
- delete confirm and cancel flows
- sensitive built-in document management under unlock protection

## Verification Plan

For implementation work based on this design:

1. Run the narrowest relevant tests first.
2. Run `make check`.
3. If document-related frontend or workflow handoff behavior changes materially, run `make dev` and verify the main demo routes listed in `CONTRIBUTING.md`, including `/documents`.

This follows the repo workflow requirements in `AGENTS.md`.

## Risks and Mitigations

### Risk: Fuzzy matching causes unsafe actions

Mitigation:

- deterministic matching only
- confirmation step before destructive actions
- no silent execution from fuzzy input

### Risk: Router complexity continues to grow

Mitigation:

- isolate document-manager logic into a dedicated helper/module
- keep `flow_router.py` focused on delegation

### Risk: Passkey unlock becomes inconsistent

Mitigation:

- store unlock state in session `collected_data`
- centralize unlock checking and refresh logic
- test expiry and refresh rules explicitly

## Recommended Next Step

Create an implementation plan that starts with:

1. test-first coverage for the new document manager flows
2. extraction of document-manager state handling behind a helper boundary
3. incremental rollout of list, upload, retrieve/send, edit, replace, delete, and unlock-session behavior
