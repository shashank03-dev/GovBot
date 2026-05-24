# Workflow Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a repo-enforced workflow layer for GOVbot, fix the currently failing gates, and verify the main user flow end to end from a user perspective.

**Architecture:** A root `Makefile` becomes the single command surface for setup, checks, and dev tasks. Backend startup is narrowed to runtime concerns, while explicit bootstrap tasks handle one-time mutating work. CI and shared agent tooling reuse the same tracked commands and configuration to keep local and automated behavior aligned.

**Tech Stack:** GNU Make, GitHub Actions, FastAPI, pytest, Next.js, ESLint, TypeScript, Node.js test runner, Chrome DevTools MCP

---

### Task 1: Add the canonical workflow surface

**Files:**
- Create: `Makefile`
- Create: `pytest.ini`
- Test: `tests/`
- Test: `frontend/lib/*.test.mjs`

- [ ] **Step 1: Write the failing workflow invocation expectation**

Document the expected root commands in the new Makefile:

```make
setup:
dev:
dev-backend:
dev-frontend:
test:
test-backend:
test-frontend:
lint:
typecheck:
build:
check:
bootstrap:
```

- [ ] **Step 2: Verify the current repo lacks this contract**

Run: `ls Makefile pytest.ini 2>/dev/null || true`
Expected: neither file exists

- [ ] **Step 3: Add root workflow commands**

Create `Makefile` with explicit commands:

```make
PYTHON ?= python3
PIP ?= $(PYTHON) -m pip
NPM ?= npm

.PHONY: setup dev dev-backend dev-frontend bootstrap test test-backend test-frontend lint typecheck build check

setup:
	$(PIP) install -r requirements.txt
	cd frontend && $(NPM) install

dev:
	@echo "Run make dev-backend and make dev-frontend in separate shells."

dev-backend:
	uvicorn gov_agent.main:app --host 0.0.0.0 --port 8000 --reload

dev-frontend:
	cd frontend && $(NPM) run dev

bootstrap:
	$(PYTHON) scripts/bootstrap_backend.py

test: test-backend test-frontend

test-backend:
	pytest -q

test-frontend:
	node --test frontend/lib/*.test.mjs

lint:
	cd frontend && $(NPM) run lint

typecheck:
	cd frontend && $(NPM) run typecheck

build:
	cd frontend && $(NPM) run build

check: test lint typecheck build
```

- [ ] **Step 4: Add repo-root pytest configuration**

Create `pytest.ini`:

```ini
[pytest]
pythonpath = .
testpaths = tests
```

- [ ] **Step 5: Run the backend tests to verify root config works**

Run: `pytest -q`
Expected: tests run from repo root instead of failing with `ModuleNotFoundError: No module named 'gov_agent'`

- [ ] **Step 6: Run the frontend tests through the new workflow surface**

Run: `make test-frontend`
Expected: Node test runner passes all frontend library tests

- [ ] **Step 7: Commit the workflow surface**

```bash
git add Makefile pytest.ini
git commit -m "build: add root workflow commands"
```

### Task 2: Make frontend gates fail correctly and pass cleanly

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/next.config.ts`
- Modify: `frontend/components/CredentialCard.tsx`
- Modify: `frontend/components/LanguageSelector.tsx`
- Modify: `frontend/components/Layout.tsx`
- Modify: `frontend/pages/api/digilocker/mock/send-otp.ts`
- Modify: `frontend/pages/api/digilocker/mock/verify-otp.ts`
- Modify: `frontend/pages/api/documents/validate.ts`
- Modify: `frontend/pages/api/live/[session].ts`
- Modify: `frontend/pages/api/ocr/extract.ts`
- Modify: `frontend/pages/api/pm-kisan.ts`
- Modify: `frontend/pages/api/send-otp.ts`
- Modify: `frontend/pages/api/verify-otp.ts`
- Modify: `frontend/pages/bank-verify.tsx`
- Modify: `frontend/pages/digilocker/callback.tsx`
- Modify: `frontend/pages/digilocker/index.tsx`
- Modify: `frontend/pages/eligibility.tsx`
- Modify: `frontend/pages/form-fill.tsx`
- Modify: `frontend/pages/nsp/apply.tsx`
- Modify: `frontend/pages/ocr.tsx`
- Modify: `frontend/pages/pmkisan.tsx`
- Modify: `frontend/pages/renewals.tsx`
- Test: `frontend`

- [ ] **Step 1: Write the failing gate expectation**

Capture the current failures:

Run: `cd frontend && npm run lint`
Expected: non-zero exit with the currently reported lint errors

- [ ] **Step 2: Add explicit frontend workflow scripts**

Update `frontend/package.json` scripts:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint .",
  "typecheck": "tsc --noEmit",
  "test": "node --test lib/*.test.mjs"
}
```

- [ ] **Step 3: Remove the false-green build behavior**

Update `frontend/next.config.ts` by deleting:

```ts
typescript: {
  ignoreBuildErrors: true,
},
```

- [ ] **Step 4: Fix React hook and state effect lint violations**

Refactor components like `LanguageSelector.tsx` and `Layout.tsx` so initial state is derived without synchronous `setState` calls inside `useEffect`.

- [ ] **Step 5: Fix type-safety and unused-variable violations**

Replace `any` types with concrete page-local types, remove dead imports and dead variables, and escape JSX entities where required.

- [ ] **Step 6: Re-run lint until it passes**

Run: `cd frontend && npm run lint`
Expected: exit 0

- [ ] **Step 7: Run explicit typechecking**

Run: `cd frontend && npm run typecheck`
Expected: exit 0

- [ ] **Step 8: Run the frontend test suite**

Run: `cd frontend && npm run test`
Expected: exit 0

- [ ] **Step 9: Run the frontend build with real TypeScript enforcement**

Run: `cd frontend && npm run build`
Expected: exit 0 without `ignoreBuildErrors`

- [ ] **Step 10: Commit the frontend hardening**

```bash
git add frontend/package.json frontend/next.config.ts frontend/components frontend/pages
git commit -m "fix: make frontend workflow gates meaningful"
```

### Task 3: Move backend mutation behind explicit bootstrap and add env templates

**Files:**
- Create: `scripts/bootstrap_backend.py`
- Create: `.env.example`
- Create: `frontend/.env.local.example`
- Modify: `gov_agent/main.py`
- Modify: `README.md`
- Test: `gov_agent/main.py`

- [ ] **Step 1: Write the failing startup-boundary expectation**

The backend should validate config at startup but should not mutate state or ingest data automatically.

- [ ] **Step 2: Extract one-time backend bootstrap operations**

Create `scripts/bootstrap_backend.py`:

```python
from __future__ import annotations

import asyncio

from gov_agent.config import validate_config
from gov_agent.document_vault import cleanup_document_duplicates
from gov_agent import rag_engine


async def main() -> None:
    validate_config()
    removed = cleanup_document_duplicates()
    print(f"Document vault cleanup removed {removed} duplicate rows")
    count = await rag_engine.ingest_document("gov_agent/docs/scholarship_rules.pdf")
    print(f"RAG bootstrap ingested {count} chunks")


if __name__ == "__main__":
    asyncio.run(main())
```

- [ ] **Step 3: Simplify app startup**

Update `gov_agent/main.py` so lifespan keeps config validation but removes duplicate cleanup and automatic RAG ingestion logic.

- [ ] **Step 4: Add backend env template**

Create `.env.example` containing required and common optional variables with safe placeholder values.

- [ ] **Step 5: Add frontend env template**

Create `frontend/.env.local.example`:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
NEXT_PUBLIC_SUPABASE_KEY=example-anon-key
```

- [ ] **Step 6: Update repo docs to use explicit bootstrap**

Update `README.md` setup and verification sections to use `make setup`, `make bootstrap`, and `make check`.

- [ ] **Step 7: Verify backend tests still pass after startup split**

Run: `pytest -q`
Expected: exit 0

- [ ] **Step 8: Commit the backend bootstrap changes**

```bash
git add scripts/bootstrap_backend.py .env.example frontend/.env.local.example gov_agent/main.py README.md
git commit -m "build: separate backend bootstrap from app startup"
```

### Task 4: Add canonical contributor docs, shared agent tooling, and CI

**Files:**
- Create: `CONTRIBUTING.md`
- Create: `AGENTS.md`
- Create: `.github/workflows/ci.yml`
- Modify: `.cursor/mcp.json`
- Modify: `frontend/README.md`

- [ ] **Step 1: Write the failing repo-enforcement expectation**

The repo should have a tracked contributor workflow and a CI workflow that runs the same commands as local development.

- [ ] **Step 2: Add canonical contributor workflow**

Create `CONTRIBUTING.md` documenting:

```md
- required tools
- env setup from example files
- make setup
- make bootstrap
- make dev-backend / make dev-frontend
- make check
- browser verification expectations
```

- [ ] **Step 3: Add tracked agent guidance**

Create `AGENTS.md` documenting:

```md
- root commands to prefer
- verification expectations before claiming success
- MCP env vars expected for Supabase, GitHub, Vercel, docs lookup
- note that .planning and .superpowers are local scratch, not canonical workflow docs
```

- [ ] **Step 4: Expand shared Cursor MCP config**

Update `.cursor/mcp.json` to include tracked definitions for:

```json
{
  "mcpServers": {
    "chrome-devtools": { "command": "npx", "args": ["-y", "chrome-devtools-mcp@latest"] },
    "context7": { "command": "npx", "args": ["-y", "@upstash/context7-mcp"] },
    "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"], "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}" } },
    "vercel": { "command": "npx", "args": ["-y", "@vercel/mcp-adapter"], "env": { "VERCEL_TOKEN": "${VERCEL_TOKEN}" } },
    "supabase": { "command": "npx", "args": ["-y", "@supabase/mcp-server-supabase"], "env": { "SUPABASE_ACCESS_TOKEN": "${SUPABASE_ACCESS_TOKEN}" } }
  }
}
```

- [ ] **Step 5: Add CI that reuses the repo workflow surface**

Create `.github/workflows/ci.yml` that runs:

```yaml
- make setup
- make check
```

with Python and Node.js setup steps before execution.

- [ ] **Step 6: Replace the stock frontend README**

Update `frontend/README.md` to point contributors to the root workflow docs instead of the default `create-next-app` template.

- [ ] **Step 7: Verify the new repo contract locally**

Run: `make check`
Expected: exit 0

- [ ] **Step 8: Commit docs, agent tooling, and CI**

```bash
git add CONTRIBUTING.md AGENTS.md .github/workflows/ci.yml .cursor/mcp.json frontend/README.md
git commit -m "docs: add canonical workflow and shared tooling"
```

### Task 5: Run full verification, including browser-based user checks

**Files:**
- Modify: `docs/implementation/2026-05-24-workflow-prod-hardening-design.md`
- Modify: `docs/implementation/2026-05-24-workflow-prod-hardening-plan.md`

- [ ] **Step 1: Run the full repo verification gate**

Run: `make check`
Expected: all backend tests, frontend tests, lint, typecheck, and build pass

- [ ] **Step 2: Start backend and frontend locally**

Run in separate shells:

```bash
make dev-backend
make dev-frontend
```

Expected: backend on `http://localhost:8000`, frontend on `http://localhost:3000`

- [ ] **Step 3: Verify from a user perspective in the browser**

Check the main demo-safe path:

```text
1. Load the landing page
2. Navigate to the service entry points
3. Verify the login surface renders
4. Exercise the primary non-destructive happy path available with local envs
5. Confirm no broken layout, fatal client error, or failing network path blocks the user journey
```

- [ ] **Step 4: Capture any blockers truthfully**

If a real external dependency prevents a full path, record:

```text
- what was attempted
- where the flow stopped
- whether the workflow layer still verified correctly
```

- [ ] **Step 5: Commit the final tracked docs updates**

```bash
git add docs/implementation/2026-05-24-workflow-prod-hardening-design.md docs/implementation/2026-05-24-workflow-prod-hardening-plan.md
git commit -m "docs: record workflow hardening verification"
```
