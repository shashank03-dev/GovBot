# AGENTS

Use the repo workflow layer instead of improvised commands.

## Required Commands

- `make setup` installs Python and frontend dependencies.
- `make bootstrap` is the only supported way to run backend cleanup and RAG ingestion.
- `make check` is the minimum completion gate before claiming the repo is healthy.

## Verification Standard

- For code changes, run the narrowest target first, then `make check`.
- For workflow or frontend changes, also run a browser pass with `make dev` and verify the main demo routes from `CONTRIBUTING.md`.
- Do not treat a passing frontend build as sufficient unless lint and `make typecheck` also pass.

## Shared MCP Setup

The tracked `.cursor/mcp.json` enables project-scoped tooling for:

- Chrome DevTools for browser verification
- Context7 for up-to-date documentation lookup
- Supabase MCP in read-only mode by default
- Vercel MCP for project and deployment inspection
- GitHub MCP using `GITHUB_PERSONAL_ACCESS_TOKEN`

## MCP Environment Notes

- Set `GITHUB_PERSONAL_ACCESS_TOKEN` in your shell or Cursor environment before using GitHub MCP.
- Set `CONTEXT7_API_KEY` locally if you want higher Context7 rate limits; the shared config works without it.
- Keep Supabase MCP scoped to non-production data and retain manual approval for every tool call.

## Repo-Specific Expectations

- Do not reintroduce mutating work into FastAPI startup.
- Do not weaken lint, typecheck, or CI gates to get green builds.
- Keep canonical workflow updates in `CONTRIBUTING.md`, not in local-only planning files.
