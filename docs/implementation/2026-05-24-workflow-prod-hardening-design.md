# Workflow Production Hardening Design

**Date:** 2026-05-24
**Branch:** `feat/workflow-prod-hardening`

## Goal

Turn GOVbot's development workflow into a repo-enforced production-style workflow that fails correctly when the project is unhealthy, fixes the currently failing gates, and supports browser-level end-to-end verification of the main user path.

## Problem Statement

The current repository has real tests and a substantial product surface, but the workflow layer is weak:

- There is no single root command surface for setup, testing, linting, building, or verification.
- There is no CI, so nothing enforces a consistent quality gate on push or pull request.
- The frontend build is misleading because Next.js is configured to ignore TypeScript build errors.
- Backend test execution depends on ad hoc shell prefixes instead of project configuration.
- The app performs expensive and mutating startup work during FastAPI boot.
- Environment setup is documented but not templated.
- Repo-shared agent tooling is incomplete relative to the actual stack.
- Canonical contributor documentation is fragmented or stale.

## In Scope

- Add a root task runner with a stable local command surface.
- Add CI that runs the same local gate used by contributors.
- Add backend test runner configuration so `pytest` works from the repo root.
- Add frontend `test` and `typecheck` scripts.
- Remove `ignoreBuildErrors` from the frontend build path.
- Fix the current frontend lint failures instead of weakening rules.
- Move mutating backend startup work behind an explicit bootstrap command.
- Add root and frontend env example files.
- Add one canonical contributor workflow document and align the frontend README to it.
- Expand tracked Cursor MCP configuration for the repo's actual stack.
- Add tracked agent guidance that documents repo commands and verification expectations.
- Run end-to-end verification after implementation, including browser-level user checks.

## Out of Scope

- Broad product feature work unrelated to workflow hardening.
- Full dependency modernization across the stack.
- Large refactors of backend domain logic outside what is required to separate runtime boot from explicit bootstrap.
- Full archival or cleanup of all local planning artifacts outside the canonical workflow docs.

## Constraints

- Work must happen on a separate branch in an isolated worktree.
- Existing unrelated local changes on `main` must remain untouched.
- Workflow commands must work for the mixed Python plus Next.js repo.
- Repo gates should be strict enough to mean something, not cosmetically green.
- End-to-end verification should use a user perspective, not just route checks.

## Selected Approach

### 1. Root workflow surface

Use a root `Makefile` as the canonical entry point because the repo is polyglot and does not currently have a root package manager manifest. `make` provides a small, explicit interface that can orchestrate Python, Node.js, and browser verification steps without introducing another runtime dependency.

### 2. Meaningful frontend gates

Treat linting, typechecking, and building as distinct checks. The frontend build must stop ignoring TypeScript errors. Existing lint failures will be fixed in code so the gates reflect real health.

### 3. Explicit backend bootstrap

Keep required config validation at startup, but move duplicate cleanup and RAG ingestion out of FastAPI lifespan. Replace that behavior with an explicit bootstrap command that can be run intentionally during setup or verification.

### 4. Single contributor contract

Document the canonical workflow in one tracked file, then reduce other docs to pointers where appropriate. This keeps the source of truth versioned and close to the commands CI will run.

### 5. Shared agent tooling

Treat agent tooling as part of the repo workflow, not a local personal setup. Cursor MCP configuration and agent guidance will be tracked and aligned with the stack already used by the project: browser automation, docs lookup, GitHub, Vercel, and Supabase.

## File Structure

### New files

- `Makefile`: canonical repo command surface.
- `pytest.ini`: backend test runner configuration from repo root.
- `.env.example`: backend environment template.
- `frontend/.env.local.example`: frontend environment template.
- `CONTRIBUTING.md`: canonical contributor workflow.
- `AGENTS.md`: tracked agent guidance for repo commands and verification.
- `.github/workflows/ci.yml`: pull request and push workflow gate.
- `scripts/bootstrap_backend.py`: explicit backend bootstrap entry point.
- `docs/implementation/2026-05-24-workflow-prod-hardening-design.md`: this design record.
- `docs/implementation/2026-05-24-workflow-prod-hardening-plan.md`: implementation plan.

### Modified files

- `.cursor/mcp.json`: shared MCP definitions for the actual stack.
- `README.md`: point contributors to the canonical workflow and keep product overview intact.
- `frontend/README.md`: replace the stock Next.js boilerplate with a repo-specific pointer.
- `frontend/package.json`: add `test`, `typecheck`, and stricter lint usage if needed.
- `frontend/next.config.ts`: remove `ignoreBuildErrors`.
- `gov_agent/main.py`: remove mutating boot behavior and wire explicit bootstrap boundaries.
- `gov_agent/config.py`: reuse current configuration rules from explicit bootstrap code as needed.
- Frontend components and pages currently failing lint: fix code, do not lower the bar.

## Data and Control Flow

### Local development

1. Contributor copies env templates.
2. Contributor runs `make setup`.
3. Contributor optionally runs `make bootstrap` for one-time backend preparation.
4. Contributor uses `make dev`, `make dev-backend`, or `make dev-frontend`.
5. Contributor runs `make check` before pushing.

### CI

1. Checkout repo.
2. Install Python and Node.js dependencies.
3. Run the same repo-level commands used locally.
4. Fail the workflow on lint, typecheck, test, or build regressions.

### Runtime startup

1. Backend starts.
2. Config validation runs.
3. App mounts routers and serves requests.
4. No duplicate cleanup or RAG ingestion happens implicitly at boot.

## Error Handling

- `make` targets must fail fast with non-zero exits when any underlying command fails.
- Backend bootstrap must surface configuration and ingestion failures clearly without hiding them behind app startup.
- CI must not swallow frontend type or lint failures.
- Browser verification steps must report exactly what was verified and any blockers encountered.

## Testing and Verification Strategy

### Required local gate

`make check` will cover:

- backend tests
- frontend unit tests
- frontend lint
- frontend typecheck
- frontend build

### Post-implementation user-perspective verification

After code changes:

1. Run fresh verification commands from the new workflow surface.
2. Start the backend and frontend locally with demo-safe envs.
3. Use browser automation to exercise the main demo path from the perspective of a user.
4. Record what worked, what had to be stubbed, and whether the workflow layer now blocks unhealthy states correctly.

## Success Criteria

- Contributors can run one root command surface instead of memorizing scattered commands.
- CI enforces the same checks contributors run locally.
- The frontend build no longer ignores TypeScript errors.
- Current lint failures are fixed, not bypassed.
- `pytest` works from repo root without `PYTHONPATH=.` in the shell command.
- Mutating backend setup work is no longer part of normal app boot.
- Env examples exist for backend and frontend.
- A tracked canonical contributor doc exists.
- Shared MCP and agent setup reflect the stack the repo actually uses.
- Browser-level verification is completed after the hardening changes.
