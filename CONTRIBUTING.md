# Contributing

This repo now has one enforced workflow surface. Use the root `Makefile` instead of ad hoc commands.

## Setup

1. Copy the environment templates.
   `cp .env.example .env`
   `cp frontend/.env.local.example frontend/.env.local`
2. Install dependencies.
   `make setup`
3. Run the explicit backend bootstrap once per fresh workspace or when the local Chroma or Supabase state needs repair.
   `make bootstrap`

## Daily Commands

- `make dev` runs backend and frontend together.
- `make dev-backend` runs the FastAPI app on `http://127.0.0.1:8000`.
- `make dev-frontend` runs Next.js on `http://127.0.0.1:3000`.
- Override local ports when needed with `make dev BACKEND_PORT=8001 FRONTEND_PORT=3001`.
- `make test-backend` runs `pytest -q` from the repo root.
- `make test-frontend` runs the frontend Node test suite.
- `make lint` runs the frontend ESLint gate.
- `make typecheck` runs `tsc --noEmit`.
- `make build` runs the production Next.js build.
- `make check` runs the full repo gate: backend tests, frontend tests, lint, typecheck, and build.

## Quality Bar

- CI runs `make setup` and `make check` on every push and pull request.
- Do not bypass failing lint, type, or build errors to get a green build.
- FastAPI startup is intentionally non-mutating now. If local document cleanup or RAG ingestion is needed, run `make bootstrap` explicitly.

## Branching And Review

- Work on a feature branch. Keep `main` clean.
- Do not commit `.env`, `frontend/.env.local`, `.next`, `node_modules`, `chroma_db`, or personal IDE state.
- Before asking for review or merging, run `make check`.

## User-Perspective Verification

After workflow or user-facing changes, verify the app from the browser, not just with unit tests.

1. Start the backend and frontend with `make dev`.
2. Confirm the backend health check at `http://127.0.0.1:8000/govbot/health`.
3. Walk the main demo routes from the frontend:
   `/`
   `/services`
   `/documents`
   `/form-fill`
   `/renewals`
   `/bank-verify`
   `/track-search`
4. Record any flow that depends on real third-party credentials or seeded Supabase data.

## Agent Tooling

- Shared Cursor MCP setup lives in `.cursor/mcp.json`.
- Shared agent workflow guidance lives in `AGENTS.md`.
- Keep manual MCP approvals enabled, especially for Supabase and Vercel.
