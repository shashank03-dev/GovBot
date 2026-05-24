# Multi-Provider Text Router Design

Date: 2026-05-24
Status: Draft for review

## Goal

Add a fast, cloud-only, test-focused text generation pool that spreads chat/text requests across multiple providers instead of relying on a single Gemini API key.

The primary goal is lower user-visible latency and better resilience during testing when one free-tier provider is slow or rate-limited.

## Current Repo Context

On `main`, Gemini is called directly from multiple backend modules:

- `gov_agent/flow_router.py`
- `gov_agent/pm_kisan_agent.py`
- `gov_agent/form_scanner_router.py`
- `gov_agent/digilocker_agent.py`
- `gov_agent/document_vault.py`
- `gov_agent/rag_engine.py`

These usages are not uniform:

- `flow_router.py` and `pm_kisan_agent.py` are plain text/chat candidates.
- `form_scanner_router.py`, `digilocker_agent.py`, and `document_vault.py` use document/image analysis.
- `rag_engine.py` uses Gemini embeddings plus text generation.

Because provider compatibility is much better for text than for vision or embeddings, the first version will only pool chat/text calls.

## Scope

### In scope

- Shared multi-provider routing for chat/text generation.
- Fast failover across cloud providers.
- Health-aware provider selection biased toward lowest latency.
- Small exact-match cache for repeated test prompts.
- User-end verification before merge.

### Out of scope

- OCR pooling.
- Image or document analysis pooling.
- Embedding pooling.
- Local model fallback.
- Full production-grade metrics stack.

## Provider Strategy

The first version uses three direct providers:

- Groq as primary for low-latency interactive text.
- Gemini as secondary because the repo already depends on it.
- Mistral as tertiary to widen free-tier test headroom.

OpenRouter is intentionally excluded from v1 because it adds another routing hop and its official free-tier request limits are too restrictive for this goal.

## Architecture

### New module

Add `gov_agent/llm_text_router.py`.

This module owns:

- provider registration
- provider selection
- cooldown state
- latency tracking
- fast retry/failover
- small in-memory cache
- router-level logging

It exposes one narrow API for text generation, for example:

- `generate_text(prompt: str, *, task: str = "interactive") -> str`

The initial API stays intentionally small. Structured output, tools, streaming, and multimodal support are deferred.

### Provider adapters

Add small provider-specific adapters under `gov_agent/providers/`:

- `gemini_provider.py`
- `groq_provider.py`
- `mistral_provider.py`

Each adapter implements the same contract:

- accept normalized text input
- call one provider-specific SDK or HTTP endpoint
- return normalized text output
- surface provider-specific errors in a form the router can classify

Adapters must not own routing decisions.

### Config

Keep the existing `GEMINI_API_KEY` for legacy non-router Gemini paths.

Add a new config variable for text pooling:

- `TEXT_LLM_PROVIDERS_JSON`

Example:

```json
[
  {
    "name": "groq-1",
    "provider": "groq",
    "model": "llama-3.1-8b-instant",
    "api_key_env": "GROQ_API_KEY_1",
    "enabled": true,
    "weight": 3
  },
  {
    "name": "gemini-1",
    "provider": "gemini",
    "model": "gemini-2.0-flash",
    "api_key_env": "GEMINI_API_KEY_1",
    "enabled": true,
    "weight": 2
  },
  {
    "name": "mistral-1",
    "provider": "mistral",
    "model": "mistral-small-latest",
    "api_key_env": "MISTRAL_API_KEY_1",
    "enabled": true,
    "weight": 1
  }
]
```

Each entry describes one usable endpoint in the pool. Multiple keys from the same provider are allowed, but each is still treated as a separate pool member.

## Routing Model

### Selection policy

Use weighted health-based routing, not strict round-robin.

The router calculates a score for each enabled provider using:

- configured weight
- cooldown state
- recent failure count
- recent observed latency

The healthiest low-latency provider with the best score is selected first.

### Latency bias

Latency is a first-class routing input.

The router should prefer:

- Groq when healthy and fast
- then Gemini
- then Mistral

This default ordering is a startup bias, not a hardcoded permanent order. If Groq becomes slower or starts failing, the router should move traffic away from it.

### Cooldowns

On `429` or equivalent rate-limit exhaustion:

- mark the provider unavailable immediately
- apply a cooldown window
- skip it for subsequent requests until cooldown expiry

Repeated rate-limit failures should increase cooldown length up to a bounded maximum.

### Retry behavior

For `interactive` tasks:

- try one provider
- allow one fast failover to the next healthy provider
- do not do long exponential backoff inside the user request path

If both attempts fail, return the current application fallback behavior rather than making the user wait.

### Time budgets

Use short per-attempt time budgets.

The exact numbers can be tuned during implementation, but the design target is:

- about 2 to 3 seconds for the first provider attempt
- one quick failover attempt

The router should optimize for tail latency, not maximum retry persistence.

## Cache

Add a small in-memory exact-match cache in the router.

Purpose:

- absorb repeated testing clicks
- return identical repeated prompts immediately
- reduce unnecessary free-tier usage

Rules:

- cache key includes provider-agnostic request content and task type
- short TTL
- exact match only
- no cache for prompts that contain obviously request-specific identifiers if that creates correctness risk

This cache is a test optimization, not a durable storage layer.

## Initial Integration Targets

The first version should route only the plain text call sites:

- `gov_agent/flow_router.py`
- `gov_agent/pm_kisan_agent.py`

These are the highest-value low-risk paths for a first rollout.

The following remain pinned to their current implementation:

- `gov_agent/form_scanner_router.py`
- `gov_agent/digilocker_agent.py`
- `gov_agent/document_vault.py`
- `gov_agent/rag_engine.py`

This split is deliberate. It preserves current behavior for vision and embeddings while proving the text pool in real user-facing flows.

## Error Handling

The router must classify failures into at least these buckets:

- rate-limited
- timeout
- provider unavailable
- malformed response
- unexpected error

Behavior:

- rate-limited: cooldown and fail over
- timeout: fail over quickly
- malformed response: treat as provider failure and fail over
- unexpected error: log and fail over if budget remains

When all providers are unavailable, the system must return the feature's existing safe fallback rather than raising an unhandled exception to the user.

## Verification Requirements

No merge unless verification proves both success and failover from the user side.

### Unit tests

- provider adapter success paths
- provider adapter error mapping
- router selection prefers healthy lower-latency providers
- `429` triggers cooldown
- interactive requests do one fast failover
- cache hits avoid a second upstream call

### Integration tests

- mocked multi-provider success path
- mocked primary failure plus secondary success
- mocked all-providers-exhausted fallback path

### Live smoke checks

Provide a small probe path or script that records:

- provider
- model
- status
- latency in milliseconds

This is used to confirm real configured credentials work before browser verification.

### User-end browser verification

Before merge, verify at least one real frontend flow end to end, for example:

- open `/pmkisan`
- submit a real request
- confirm frontend render succeeds
- confirm backend returns `200`
- confirm visible response text is shown

Then prove failover:

- make one provider unavailable or exhausted
- rerun the same user flow
- confirm the request still completes through another provider

### Merge gate

Do not merge unless all of the following are true:

- automated tests pass
- at least one live text request succeeds through the provider pool
- at least one live failover path is verified
- browser verification confirms acceptable user experience

## Observability

For each router request, log:

- chosen provider
- chosen model
- latency in milliseconds
- cache hit or miss
- failover count
- final error type if any

This is sufficient for the testing phase and avoids adding a full metrics system too early.

## Non-Goals for This Spec

This spec does not attempt to solve:

- provider-agnostic vision prompts
- cross-provider embedding equivalence
- production SLA guarantees
- account farming or quota-evasion strategies

The design is meant to be legitimate, test-focused, and low-friction.

## Recommended Implementation Order

1. Add config parsing for `TEXT_LLM_PROVIDERS_JSON`.
2. Add provider adapters.
3. Add `llm_text_router.py`.
4. Cover the router with unit tests.
5. Integrate `flow_router.py` and `pm_kisan_agent.py`.
6. Run automated tests.
7. Run live provider smoke checks.
8. Run browser verification from the user side.
9. Merge only if success and failover are both proven.
