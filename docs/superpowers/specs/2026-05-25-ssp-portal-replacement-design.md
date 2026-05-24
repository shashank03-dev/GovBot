# SSP Portal Replacement Design

## Goal

Replace the current `PMSS` scholarship surface with a full `SSP` portal domain across the entire project.

The replacement must:
- remove `PMSS` from frontend routes, visible product copy, backend identifiers, analytics keys, DigiLocker routing, WhatsApp states, and tests,
- make `/ssp` the only live student route for this portal,
- reproduce the provided SSP portal structure across the public landing page, logged-in step dashboard, step 1-5 forms, and final preview/submit flow,
- support both manual entry and auto-fill from existing GovBot profile and DigiLocker-prefill data,
- keep English as the default language while supporting Kannada throughout the SSP experience,
- be production-ready rather than a disconnected visual mock.

## Chosen Strategy

Use an SSP-native replacement rather than a PMSS re-skin.

This migration treats `SSP` as a first-class portal with its own route family, shared draft model, and renamed backend workflow. The visual system should match the supplied SSP references closely, but the data layer should remain GovBot-owned so the same user profile, DigiLocker import, and WhatsApp intake can continue one application state across channels.

## Approved Scope

### In scope

- Replace every `PMSS` reference in the repo with `SSP`, including internal identifiers such as:
  - route names,
  - backend state names,
  - analytics keys,
  - DigiLocker portal keys,
  - WhatsApp flow states,
  - tests and fixtures.
- Remove `/pmss` as a live route and make `/ssp` the only student route.
- Build the full SSP-facing experience shown in the screenshots:
  - public landing page,
  - logged-in student step dashboard,
  - step 1 page,
  - step 2 page,
  - step 3 page,
  - step 4 page,
  - step 5 preview/final submit page.
- Keep manual entry available on every step.
- Auto-fill from existing GovBot profile and DigiLocker data when available.
- Connect WhatsApp SSP intake to the same application draft used by the web flow.
- Maintain a consistent SSP design shell in both English and Kannada.

### Out of scope

- Keeping `/pmss` alive as a redirect.
- Runtime machine translation for the SSP UI.
- A partial visual update that leaves the old PMSS information architecture in place.
- A separate throwaway mock disconnected from GovBot storage and flow logic.

## User-Approved Flow

### Web

1. User opens `/ssp` and sees the SSP-style public landing page.
2. User can switch between English and Kannada, with English as the default.
3. User chooses login or create-account style entry points from the SSP landing page.
4. After authentication, user lands on an SSP dashboard page with step cards for:
   - Step 1: study, caste, personal details
   - Step 2: student college details
   - Step 3: e-attestation details
   - Step 4: hostel details
   - Step 5: preview and final submit
5. Each step opens an SSP-style page with bilingual labels, warnings, and section groupings.
6. Existing GovBot data pre-populates the shared SSP draft where possible.
7. User may edit any field manually; manual edits override prefilled values.
8. The final step renders an SSP-style preview table and declaration before final submission.

### WhatsApp

1. User chooses scholarship application in chat.
2. GovBot shows the scholarship menu with `SSP` instead of `PMSS`.
3. WhatsApp SSP intake collects the same application fields under `ssp_*` states.
4. If DigiLocker or profile data is available, GovBot uses it to prefill the SSP application state.
5. If the user later opens the web SSP flow, the same draft appears on `/ssp` step pages.
6. Final submission and tracking use the same portal key: `ssp`.

## Architecture

### SSP route family

The frontend should stop treating the current portal mock as a single overloaded page.

Introduce an SSP route family with clear boundaries:
- `/ssp`
  - public landing page
- `/ssp/dashboard`
  - logged-in step dashboard
- `/ssp/step-1`
  - SSLC, caste, disability, personal details
- `/ssp/step-2`
  - college and course details
- `/ssp/step-3`
  - e-attestation details
- `/ssp/step-4`
  - hostel or day-scholar details
- `/ssp/step-5`
  - preview and final submit

The old `/pmss` route should be removed from navigation, layout exceptions, and route references. The old `portal=pmss` branch inside `/nsp/apply` should be replaced by SSP-native routes.

### Shared SSP draft

The SSP flow needs one shared draft object that survives across:
- all SSP step pages,
- DigiLocker review continuation,
- GovBot profile prefill,
- WhatsApp intake state,
- final submission and tracking.

Draft data comes from three sources in this precedence order:
1. manual edits,
2. DigiLocker or other portal-prefill imports,
3. existing GovBot profile defaults.

Manual edits always win. Prefill is a starting layer only.

### Frontend composition

The UI should be implemented as reusable SSP-specific building blocks instead of one huge page:
- SSP portal shell
- SSP header and utility bar
- SSP navigation bar
- SSP bilingual notice banner
- SSP step cards
- SSP section accordion
- SSP form row and field wrappers
- SSP preview table
- SSP declaration and final-submit block

These components should keep the visual system consistent across every SSP page.

### Backend composition

Backend logic should follow the same portal boundary:
- portal listing and application submission use `ssp`
- WhatsApp routing uses `ssp_*` states
- DigiLocker portal rules use `ssp`
- eligibility rules refer to `SSP`
- analytics counts and labels use `ssp`
- tracking and renewal logic use `ssp`

The current `pmss_agent.py` should become `ssp_agent.py` with:
- `SSPState`
- `run_ssp_application`
- `ssp` confirmation/event naming
- `ssp` portal metadata in submission results

## Data Model

### SSP draft fields

The shared SSP draft should cover the fields visible across the supplied screenshots and the final preview:
- student_id
- student_name
- father_name
- mother_name
- dob
- gender
- mobile
- email
- aadhaar_number
- religion
- category
- caste
- subcaste
- caste_certificate_number
- income_certificate_number
- income
- disability_status
- udid_number
- domicile_state
- home_district
- home_taluka
- assembly_constituency
- pincode
- permanent_address
- sslc_board
- sslc_registration_number
- sslc_pass_year
- college_name
- college_code
- university_name
- university_registration_number
- course_name
- course_discipline
- course_year
- academic_year
- admission_mode
- counselling_number
- counselling_admission_year
- previous_year_board
- previous_year_registration_number
- previous_year_result_type
- previous_year_max_marks
- previous_year_marks_obtained
- previous_year_percentage_or_cgpa
- e_attestation_status
- e_attestation_reference
- hostel_or_day_scholar
- hostel_name
- hostel_registration_reference
- final_declaration_accepted

### Source mapping

GovBot profile and DigiLocker imports should map into SSP draft fields through a translation layer rather than by mutating frontend form code directly. That translation layer should normalize:
- profile phone and identity data,
- Aadhaar-derived details,
- income certificate data,
- caste certificate data,
- marksheet data,
- current portal-prefill data already used by existing scholarship mocks.

### Persistence shape

This implementation should use one persisted portal draft keyed by phone and portal `ssp`, not fragmented per page. The stored state should include:
- current step,
- selected language,
- draft fields,
- prefill provenance,
- last-updated timestamp,
- submission status,
- confirmation number after final submit.

## Bilingual Behavior

English is the default SSP page language.

The SSP UI should use static bilingual content dictionaries for `en` and `kn` for:
- header labels,
- navigation items,
- step names,
- warnings,
- help text,
- declarations,
- button text,
- dashboard instructions,
- preview labels.

The chosen language should persist in `localStorage` and apply across all SSP pages. Static SSP copy changes with language selection. User-entered data does not change language. The existing WhatsApp language handling may continue to translate conversational replies, but the web SSP copy should remain dictionary-driven for layout stability and exact visual control.

## Error Handling

### Web form behavior

- Invalid required fields must fail inline without discarding saved progress.
- Each step save should preserve the SSP draft even if some sections are incomplete.
- Section-level validation errors should appear in SSP-style warning blocks.
- Final submit should block when any mandatory draft field is missing or invalid.
- Auto-fill failure must degrade to manual entry with a visible but non-blocking notice.
- Missing profile or DigiLocker data must not break page rendering.

### WhatsApp behavior

- Invalid DOB, Aadhaar, income, or caste input should keep the session inside the same `ssp_*` state until corrected.
- Missing required document uploads should return the user to the relevant `ssp_awaiting_*` state instead of resetting the session.
- If a web draft already exists, WhatsApp should merge into it rather than creating a separate portal branch.

### Final submission behavior

- Preview must reflect exactly what will be submitted.
- Final submit should only execute after declaration acceptance.
- On success, GovBot stores `ssp` confirmation details and updates tracking surfaces.
- On failure, the draft remains intact and the user can retry.

## Rename Surface

### Backend

The migration should rename `pmss` to `ssp` in at least these areas:
- `gov_agent/portal_router.py`
- `gov_agent/flow_router.py`
- `gov_agent/digilocker_router.py`
- `gov_agent/eligibility_router.py`
- `gov_agent/analytics_router.py`
- `gov_agent/renewal_intelligence.py`
- `gov_agent/credentials_agent.py`
- `gov_agent/npci_agent.py`
- `gov_agent/pmss_agent.py` -> `gov_agent/ssp_agent.py`
- any imports or portal enumerations that currently include `pmss`

The migration must update:
- portal IDs from `pmss` to `ssp`
- human-readable labels from `PMSS` to `SSP`
- backend function names such as `run_pmss_application` to `run_ssp_application`
- WhatsApp states such as `pmss_collect_name` to `ssp_collect_name`
- submission result metadata where portal or service still reports `pmss`

### Frontend

The migration should rename or replace:
- `frontend/pages/pmss/index.tsx`
- all navigation entries that point to `/pmss`
- all scholarship tiles that show `PMSS`
- all references to `/nsp/apply?portal=pmss`
- route guards and layout exceptions that currently include `/pmss`
- renewal, tracking, dashboard, and service labels that still show `pmss`

### Tests

The migration should update tests and fixtures referencing `pmss`, including:
- `tests/test_flow_router.py`
- `tests/test_live_dashboard.py`
- any backend tests that assert `pmss` portal keys or labels
- any frontend tests or fixtures that assert `/pmss`, `PMSS`, or `portal=pmss`

## Verification

### Narrow checks first

Run the narrowest relevant checks before the full repo gate:
- backend tests for `ssp` flow routing, portal submission, DigiLocker continuation, and tracking labels,
- frontend tests for renamed navigation, route behavior, and SSP page rendering,
- targeted type and lint checks for newly added SSP components and routes.

### Full repo gate

Run:
- `make check`

### Browser verification

Because this is a workflow and frontend change, run:
- `make dev`

Then verify:
- `/`
- `/services`
- `/official-login`
- `/documents`
- `/form-fill`
- `/renewals`
- `/bank-verify`
- `/track-search`
- `/gov-dashboard`
- `/admin`
- `/ssp`
- `/ssp/dashboard`
- `/ssp/step-1`
- `/ssp/step-2`
- `/ssp/step-3`
- `/ssp/step-4`
- `/ssp/step-5`

Also verify:
- one manual-entry SSP run,
- one auto-filled SSP run from GovBot profile data,
- one DigiLocker-assisted continuation into SSP,
- one WhatsApp-started SSP draft resumed on the web.

## Production-Ready Guardrails

- Do not keep duplicate PMSS and SSP logic alive in parallel.
- Do not leave dead `/pmss` references in menus, layout rules, or analytics enumerations.
- Do not hard-code bilingual copy inline across many pages; centralize it.
- Do not let auto-fill overwrite user edits after first manual change.
- Do not couple SSP page rendering directly to a fragile external data shape.
- Do not weaken lint, typecheck, or CI gates to ship the migration.

## Implementation Shape

This should be delivered as one coherent SSP migration, but the code should still be structured so each layer remains understandable:
- shared SSP content/config,
- shared SSP draft state and mapping,
- SSP route pages and reusable components,
- backend `ssp` portal migration,
- WhatsApp and DigiLocker alignment,
- test migration and browser verification.
