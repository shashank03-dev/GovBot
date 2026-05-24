# Gemini Gateway Design

## Goal

Replace direct Gemini SDK usage across the backend with a centralized gateway that keeps user-facing responses fast while spreading free-tier traffic across multiple Gemini projects.

## Constraints

- Production must stay on Gemini API free-tier keys only.
- The repo currently uses the legacy `google-generativeai` SDK directly in multiple modules.
- User-facing requests should fail over quickly instead of waiting through long retries.
- The first version should avoid new infrastructure such as Redis or Prometheus.

## Scope

- Add pooled Gemini project configuration in `gov_agent/config.py`.
- Add a centralized `gov_agent/llm_gateway.py`.
- Route all existing Gemini text, multimodal, and embedding calls through the gateway.
- Add in-memory cooldown, request tracking, caching, and structured logging.
- Initialize the gateway once during FastAPI startup.

## Non-Goals

- No paid-tier, Vertex AI, Redis, or external metrics backend in the first version.
- No broad refactor of unrelated business logic.
- No guarantee of hard production SLA while staying on free-tier quotas.

## Configuration Design

- Replace `GEMINI_API_KEY` with a pooled variable such as `GEMINI_PROJECTS_JSON`.
- Each project entry should include:
  - `name`
  - `api_key`
  - `enabled`
  - optional `weight`
- `validate_config()` should require at least one enabled Gemini project.
- Existing modules should stop reading Gemini credentials directly.

## Gateway Design

- Add `gov_agent/llm_gateway.py` as the only module allowed to talk to Gemini.
- Use the current migration path recommended by Google and build the gateway on the newer `google-genai` client model.
- Create one client per configured project and keep those clients alive for the app lifetime.
- Expose a narrow API:
  - `generate_text(...)`
  - `generate_multimodal(...)`
  - `embed_text(...)`
- Keep per-project runtime state in memory:
  - cooldown-until timestamp
  - recent request count
  - recent failure count
  - last observed latency
  - last error type

## Request Handling

- Classify requests into two priority classes:
  - `interactive` for live user flows such as WhatsApp replies, translations, and form mapping
  - `background` for document enrichment and non-urgent processing
- Select the healthiest available project for each request.
- Prefer the project with the lowest recent load among projects not in cooldown.
- If a project returns `429 RESOURCE_EXHAUSTED`, mark it cooling down and immediately try the next healthy project.
- `interactive` calls get at most one fast failover and no long blocking backoff.
- `background` calls may retry with jitter after a longer delay.

## Performance Design

- Keep gateway state in memory so selection overhead stays negligible.
- Because current request handlers are async while Gemini SDK calls are synchronous today, isolate blocking model calls in a threadpool until all callers are safely moved to the new client path.
- Add in-flight de-duplication for identical concurrent requests so only one Gemini call runs for the same cache key at a time.
- Use explicit time budgets so a weak project cannot stall a user-facing response.

## Cache Design

- Add an in-memory TTL cache inside the gateway.
- Cache keys should hash:
  - operation type
  - model
  - normalized prompt or content
  - relevant options that affect output
- Use short TTLs for translation and prompt normalization.
- Use longer TTLs for document extraction and embeddings.
- Cache only successful responses.

## Integration Plan

- Remove direct `genai.configure(...)` and direct model construction from:
  - `gov_agent/flow_router.py`
  - `gov_agent/document_vault.py`
  - `gov_agent/form_scanner_router.py`
  - `gov_agent/digilocker_agent.py`
  - `gov_agent/pm_kisan_agent.py`
  - `gov_agent/rag_engine.py`
- Initialize the gateway during FastAPI lifespan in `gov_agent/main.py`.
- Start by migrating one user-visible path first, then move the remaining Gemini callers once the gateway behavior is verified.

## Error Handling

- If all projects are exhausted or cooling down, return a controlled application-level failure rather than hanging.
- User-facing flows should surface a short retry-later message.
- Background flows should log the failure and re-attempt later where appropriate.
- Gateway logs should include whether a response succeeded on the first project or after failover.

## Observability

- Start with structured logs instead of a dedicated metrics system.
- Log these fields on every gateway request:
  - operation
  - model
  - selected project
  - latency
  - cache hit or miss
  - failover count
  - final status
- Track enough in-memory counters to expose later through an internal debug endpoint if needed:
  - per-project success count
  - per-project `429` count
  - average latency
  - cache hit rate

## Testing

- Keep the existing `unittest` style used in `tests/`.
- Add unit tests for:
  - project selection
  - cooldown behavior after `429`
  - cache hits and misses
  - in-flight de-duplication
  - fallback when all projects are cooling down
- Add route-level tests that mock Gemini failures and verify user-facing handlers fail over quickly.

## Rollout

1. Add pooled config and gateway module.
2. Migrate one user-facing path and verify latency, failover, and logging.
3. Migrate remaining Gemini callers.
4. Remove legacy direct Gemini configuration from the repo.

## Risks

- Free-tier limits can change over time and remain unsuitable for steady production traffic.
- In-memory cache and runtime state reset on process restart.
- Multiple app instances will not share cooldown or cache state in the first version.

## Success Criteria

- No feature module talks to Gemini directly.
- A single exhausted Gemini project does not noticeably slow user-facing requests.
- Repeated identical requests are served from cache when eligible.
- Gateway logs make it clear which project served each request and when failover occurred.
