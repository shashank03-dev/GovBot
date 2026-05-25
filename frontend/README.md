# GOVbot Frontend

This directory contains the Next.js frontend for GOVbot.

## Workflow

- Install dependencies from the repo root with `make setup`.
- Start the frontend from the repo root with `make dev-frontend`.
- Run the full repo gate from the repo root with `make check`.

## Local Commands

- `npm run dev`
- `npm run test`
- `npm run lint`
- `npm run typecheck`
- `npm run build`

## Environment

Copy `frontend/.env.local.example` to `frontend/.env.local` before starting the app.

For a Vercel-hosted demo, add these same variables to the linked Vercel project:

- `BACKEND_URL`: server-side backend base URL used by Next rewrites
- `NEXT_PUBLIC_API_URL`: public backend base URL used by browser-side helpers
- `NEXT_PUBLIC_FRONTEND_URL`: deployed frontend origin, for example `https://your-project.vercel.app`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_KEY`

When the backend is exposed through ngrok, set both `BACKEND_URL` and `NEXT_PUBLIC_API_URL` to the same ngrok HTTPS URL.

## More Context

See `../CONTRIBUTING.md` for the canonical repo workflow.
