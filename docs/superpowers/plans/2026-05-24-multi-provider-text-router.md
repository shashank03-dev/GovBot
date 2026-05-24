# Multi-Provider Text Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fast, cloud-only text generation router that spreads chat/text requests across Groq, Gemini, and Mistral for testing, while leaving vision and embedding paths untouched.

**Architecture:** Introduce a small `llm_text_router` module with provider adapters and config-driven pool members, then route only `flow_router.translate_reply()` and `pm_kisan_agent.check_pm_kisan_status()` through it. Keep latency low with health-aware provider selection, short time budgets, one fast failover, and a small in-memory exact-match cache.

**Tech Stack:** Python, FastAPI, pytest, `google-generativeai`, `openai`-compatible HTTP client pattern for Groq, `mistralai`, standard library caching/time utilities

---

## File Structure

- Create: `gov_agent/providers/__init__.py`
  - Provider package marker and shared exports if needed.
- Create: `gov_agent/providers/base.py`
  - Shared provider dataclasses, normalized request/response structures, and classified exception types.
- Create: `gov_agent/providers/gemini_provider.py`
  - Gemini text-only adapter.
- Create: `gov_agent/providers/groq_provider.py`
  - Groq text-only adapter.
- Create: `gov_agent/providers/mistral_provider.py`
  - Mistral text-only adapter.
- Create: `gov_agent/llm_text_router.py`
  - Pool loading, scoring, cooldowns, latency tracking, cache, and async text generation API.
- Modify: `gov_agent/config.py`
  - Parse `TEXT_LLM_PROVIDERS_JSON` without breaking existing legacy Gemini config.
- Modify: `gov_agent/flow_router.py`
  - Route `translate_reply()` through the new text router.
- Modify: `gov_agent/pm_kisan_agent.py`
  - Route PM-KISAN text generation through the new text router.
- Modify: `gov_agent/main.py`
  - Initialize the router once at startup.
- Create: `tests/test_llm_text_router.py`
  - Router selection, cooldown, failover, and cache tests.
- Create: `tests/test_pm_kisan_agent.py`
  - PM-KISAN adapter and fallback behavior tests.
- Modify: `tests/test_flow_router.py`
  - Translation path tests through the router.
- Modify: `README.md`
  - Document the new test-only text provider pool config and verification caveats.

### Task 1: Add Router-Focused Tests First

**Files:**
- Create: `tests/test_llm_text_router.py`
- Create: `tests/test_pm_kisan_agent.py`
- Modify: `tests/test_flow_router.py`

- [ ] **Step 1: Write the failing router tests**

```python
import asyncio
import unittest

from gov_agent.llm_text_router import (
    LLMTextRouter,
    ProviderCallError,
    ProviderConfig,
)


class _FakeProvider:
    def __init__(self, *, text="ok", latency_ms=50, error=None):
        self.text = text
        self.latency_ms = latency_ms
        self.error = error
        self.calls = 0

    async def generate_text(self, prompt, *, system_instruction=None, temperature=None, max_output_tokens=None):
        self.calls += 1
        if self.error:
            raise self.error
        await asyncio.sleep(0)
        return self.text


class LLMTextRouterTests(unittest.IsolatedAsyncioTestCase):
    async def test_prefers_healthy_lower_latency_provider(self):
        router = LLMTextRouter(
            providers=[
                ProviderConfig(name="slow", provider="gemini", model="gemini-2.0-flash", enabled=True, weight=2),
                ProviderConfig(name="fast", provider="groq", model="llama-3.1-8b-instant", enabled=True, weight=2),
            ],
            provider_clients={
                "slow": _FakeProvider(text="slow", latency_ms=900),
                "fast": _FakeProvider(text="fast", latency_ms=80),
            },
        )

        result = await router.generate_text("hello")

        self.assertEqual(result, "fast")
        self.assertEqual(router._provider_state["fast"].request_count, 1)

    async def test_rate_limited_provider_goes_into_cooldown_and_fails_over(self):
        router = LLMTextRouter(
            providers=[
                ProviderConfig(name="groq-1", provider="groq", model="llama-3.1-8b-instant", enabled=True, weight=3),
                ProviderConfig(name="gemini-1", provider="gemini", model="gemini-2.0-flash", enabled=True, weight=2),
            ],
            provider_clients={
                "groq-1": _FakeProvider(error=ProviderCallError("rate limit", kind="rate_limited")),
                "gemini-1": _FakeProvider(text="fallback"),
            },
        )

        result = await router.generate_text("hello", task="interactive")

        self.assertEqual(result, "fallback")
        self.assertTrue(router._provider_state["groq-1"].cooldown_until > 0)

    async def test_exact_match_cache_avoids_second_upstream_call(self):
        client = _FakeProvider(text="cached")
        router = LLMTextRouter(
            providers=[ProviderConfig(name="groq-1", provider="groq", model="llama-3.1-8b-instant", enabled=True, weight=3)],
            provider_clients={"groq-1": client},
            cache_ttl_seconds=30,
        )

        first = await router.generate_text("repeat me")
        second = await router.generate_text("repeat me")

        self.assertEqual((first, second), ("cached", "cached"))
        self.assertEqual(client.calls, 1)
```

- [ ] **Step 2: Write the failing PM-KISAN and translation tests**

```python
import unittest
from unittest.mock import AsyncMock, patch

from gov_agent import pm_kisan_agent


class PMKisanAgentTests(unittest.IsolatedAsyncioTestCase):
    async def test_pm_kisan_uses_text_router_when_available(self):
        with patch.object(
            pm_kisan_agent,
            "generate_text_reply",
            new=AsyncMock(return_value="router reply"),
        ):
            result = await pm_kisan_agent.check_pm_kisan_status("12345678901")

        self.assertEqual(result["message"], "router reply")

    async def test_pm_kisan_returns_static_fallback_when_router_fails(self):
        with patch.object(
            pm_kisan_agent,
            "generate_text_reply",
            new=AsyncMock(side_effect=RuntimeError("boom")),
        ):
            result = await pm_kisan_agent.check_pm_kisan_status("12345678901")

        self.assertIn("PM-KISAN Status Check", result["message"])
```

```python
    async def test_translate_reply_uses_text_router_for_supported_language(self):
        flow_router = _load_flow_router()

        with patch.object(
            flow_router,
            "generate_text_reply",
            new=AsyncMock(return_value="अनुवाद"),
        ):
            result = await flow_router.translate_reply("Hello", "hi")

        self.assertEqual(result, "अनुवाद")
```

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `SUPABASE_URL=https://example.supabase.co SUPABASE_KEY=test-key SECRET_KEY=test GEMINI_API_KEY=test PYTHONPATH=. pytest tests/test_llm_text_router.py tests/test_pm_kisan_agent.py tests/test_flow_router.py -q`

Expected: FAIL because `gov_agent.llm_text_router` and the new router integration points do not exist yet.

- [ ] **Step 4: Commit the failing tests**

```bash
git add tests/test_llm_text_router.py tests/test_pm_kisan_agent.py tests/test_flow_router.py
git commit -m "test: add multi-provider text router coverage"
```

### Task 2: Add Config Parsing and Provider Base Types

**Files:**
- Modify: `gov_agent/config.py`
- Create: `gov_agent/providers/__init__.py`
- Create: `gov_agent/providers/base.py`

- [ ] **Step 1: Extend config parsing for the text provider pool**

```python
import json
from dataclasses import dataclass


@dataclass(frozen=True)
class TextProviderEnvConfig:
    name: str
    provider: str
    model: str
    api_key_env: str
    enabled: bool = True
    weight: int = 1


def load_text_provider_env_configs() -> list[TextProviderEnvConfig]:
    raw = os.getenv("TEXT_LLM_PROVIDERS_JSON", "").strip()
    if not raw:
        return []

    payload = json.loads(raw)
    configs: list[TextProviderEnvConfig] = []
    for item in payload:
        configs.append(
            TextProviderEnvConfig(
                name=str(item["name"]),
                provider=str(item["provider"]).lower(),
                model=str(item["model"]),
                api_key_env=str(item["api_key_env"]),
                enabled=bool(item.get("enabled", True)),
                weight=max(1, int(item.get("weight", 1))),
            )
        )
    return configs
```

- [ ] **Step 2: Add normalized provider request, config, and error types**

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class ProviderConfig:
    name: str
    provider: str
    model: str
    api_key: str
    enabled: bool = True
    weight: int = 1


@dataclass(frozen=True)
class TextGenerationRequest:
    prompt: str
    system_instruction: str | None = None
    temperature: float | None = None
    max_output_tokens: int | None = None


class ProviderCallError(RuntimeError):
    def __init__(self, message: str, *, kind: str = "unexpected"):
        super().__init__(message)
        self.kind = kind
```

- [ ] **Step 3: Run the existing and new focused tests**

Run: `SUPABASE_URL=https://example.supabase.co SUPABASE_KEY=test-key SECRET_KEY=test GEMINI_API_KEY=test PYTHONPATH=. pytest tests/test_llm_text_router.py tests/test_pm_kisan_agent.py tests/test_flow_router.py -q`

Expected: FAIL later in router/provider setup, but config import errors should be gone.

- [ ] **Step 4: Commit the config and base types**

```bash
git add gov_agent/config.py gov_agent/providers/__init__.py gov_agent/providers/base.py
git commit -m "feat: add text provider pool config types"
```

### Task 3: Implement Provider Adapters and the Router Core

**Files:**
- Create: `gov_agent/providers/gemini_provider.py`
- Create: `gov_agent/providers/groq_provider.py`
- Create: `gov_agent/providers/mistral_provider.py`
- Create: `gov_agent/llm_text_router.py`
- Test: `tests/test_llm_text_router.py`

- [ ] **Step 1: Add the provider adapters**

```python
class GeminiTextProvider:
    def __init__(self, *, api_key: str, model: str):
        genai.configure(api_key=api_key)
        self._model_name = model

    async def generate_text(self, prompt, *, system_instruction=None, temperature=None, max_output_tokens=None):
        try:
            model = genai.GenerativeModel(self._model_name)
            response = await asyncio.to_thread(
                model.generate_content,
                prompt,
                generation_config={
                    "temperature": temperature or 0.3,
                    "max_output_tokens": max_output_tokens or 512,
                },
                system_instruction=system_instruction,
            )
            return response.text.strip()
        except Exception as exc:
            raise classify_provider_error(exc) from exc
```

```python
class GroqTextProvider:
    def __init__(self, *, api_key: str, model: str):
        self._client = OpenAI(api_key=api_key, base_url="https://api.groq.com/openai/v1")
        self._model = model

    async def generate_text(self, prompt, *, system_instruction=None, temperature=None, max_output_tokens=None):
        try:
            response = await asyncio.to_thread(
                self._client.chat.completions.create,
                model=self._model,
                messages=_build_messages(prompt, system_instruction),
                temperature=temperature if temperature is not None else 0.3,
                max_tokens=max_output_tokens or 512,
            )
            return response.choices[0].message.content.strip()
        except Exception as exc:
            raise classify_provider_error(exc) from exc
```

```python
class MistralTextProvider:
    def __init__(self, *, api_key: str, model: str):
        self._client = Mistral(api_key=api_key)
        self._model = model

    async def generate_text(self, prompt, *, system_instruction=None, temperature=None, max_output_tokens=None):
        try:
            response = await asyncio.to_thread(
                self._client.chat.complete,
                model=self._model,
                messages=_build_messages(prompt, system_instruction),
                temperature=temperature if temperature is not None else 0.3,
                max_tokens=max_output_tokens or 512,
            )
            return response.choices[0].message.content.strip()
        except Exception as exc:
            raise classify_provider_error(exc) from exc
```

- [ ] **Step 2: Implement router scoring, cooldowns, failover, and cache**

```python
@dataclass
class ProviderRuntimeState:
    latency_ms: float = 0.0
    failure_count: int = 0
    request_count: int = 0
    cooldown_until: float = 0.0


class LLMTextRouter:
    def __init__(self, providers, provider_clients, *, cache_ttl_seconds=20):
        self._providers = providers
        self._provider_clients = provider_clients
        self._provider_state = {cfg.name: ProviderRuntimeState() for cfg in providers}
        self._cache: dict[str, tuple[float, str]] = {}
        self._cache_ttl_seconds = cache_ttl_seconds

    async def generate_text(self, prompt, *, task="interactive", system_instruction=None, temperature=None, max_output_tokens=None):
        cache_key = self._cache_key(prompt, task, system_instruction, temperature, max_output_tokens)
        cached = self._cache.get(cache_key)
        if cached and cached[0] > time.monotonic():
            return cached[1]

        attempts = 2 if task == "interactive" else len(self._providers)
        last_error = None
        for provider in self._pick_candidates(limit=attempts):
            started = time.monotonic()
            try:
                text = await asyncio.wait_for(
                    self._provider_clients[provider.name].generate_text(
                        prompt,
                        system_instruction=system_instruction,
                        temperature=temperature,
                        max_output_tokens=max_output_tokens,
                    ),
                    timeout=2.5,
                )
                self._record_success(provider.name, started)
                self._cache[cache_key] = (time.monotonic() + self._cache_ttl_seconds, text)
                return text
            except ProviderCallError as exc:
                last_error = exc
                self._record_failure(provider.name, exc)
            except asyncio.TimeoutError as exc:
                last_error = ProviderCallError("timeout", kind="timeout")
                self._record_failure(provider.name, last_error)
        raise last_error or RuntimeError("No text providers configured")
```

- [ ] **Step 3: Run the router tests to make them pass**

Run: `SUPABASE_URL=https://example.supabase.co SUPABASE_KEY=test-key SECRET_KEY=test GEMINI_API_KEY=test PYTHONPATH=. pytest tests/test_llm_text_router.py -q`

Expected: PASS.

- [ ] **Step 4: Commit the router core**

```bash
git add gov_agent/providers gov_agent/llm_text_router.py tests/test_llm_text_router.py
git commit -m "feat: add multi-provider text router core"
```

### Task 4: Integrate the Router into Flow Translation

**Files:**
- Modify: `gov_agent/flow_router.py`
- Modify: `gov_agent/main.py`
- Test: `tests/test_flow_router.py`

- [ ] **Step 1: Replace direct Gemini translation with router usage**

```python
from gov_agent.llm_text_router import generate_text_reply


async def translate_reply(text: str, lang: str) -> str:
    if lang == "en" or lang not in _LANG_NAMES:
        return text
    try:
        prompt = (
            f"Translate this government service message to {_LANG_NAMES[lang]}, "
            f"keeping numbers, codes and URLs unchanged:\n{text}"
        )
        return await generate_text_reply(
            prompt,
            task="interactive",
            temperature=0.2,
            max_output_tokens=512,
        )
    except Exception:
        return text
```

- [ ] **Step 2: Initialize the router once during app startup**

```python
from gov_agent.llm_text_router import initialize_text_router


@asynccontextmanager
async def lifespan(app):
    from gov_agent.config import validate_config
    validate_config()
    initialize_text_router()
    ...
    yield
```

- [ ] **Step 3: Run the translation-focused tests**

Run: `SUPABASE_URL=https://example.supabase.co SUPABASE_KEY=test-key SECRET_KEY=test GEMINI_API_KEY=test PYTHONPATH=. pytest tests/test_flow_router.py -q`

Expected: PASS.

- [ ] **Step 4: Commit the translation integration**

```bash
git add gov_agent/flow_router.py gov_agent/main.py tests/test_flow_router.py
git commit -m "refactor: route flow translation through text router"
```

### Task 5: Integrate the Router into PM-KISAN

**Files:**
- Modify: `gov_agent/pm_kisan_agent.py`
- Create: `tests/test_pm_kisan_agent.py`

- [ ] **Step 1: Replace direct Gemini PM-KISAN generation with router usage**

```python
from gov_agent.llm_text_router import generate_text_reply


async def check_pm_kisan_status(identifier: str) -> dict:
    try:
        prompt = (
            f"User provided identifier: {identifier}\n"
            f"Portal link: {PM_KISAN_STATUS_URL}\n"
            f"Registration lookup link: {PM_KISAN_REG_LOOKUP_URL}\n\n"
            "Generate a helpful WhatsApp reply for this farmer."
        )
        reply_text = await generate_text_reply(
            prompt,
            task="interactive",
            system_instruction=_SYSTEM_PROMPT,
            temperature=0.3,
            max_output_tokens=512,
        )
        return {
            "status": "info",
            "message": reply_text,
            "portal_url": PM_KISAN_STATUS_URL,
            "reg_lookup_url": PM_KISAN_REG_LOOKUP_URL,
        }
    except Exception:
        return _static_fallback()
```

- [ ] **Step 2: Run the PM-KISAN tests**

Run: `SUPABASE_URL=https://example.supabase.co SUPABASE_KEY=test-key SECRET_KEY=test GEMINI_API_KEY=test PYTHONPATH=. pytest tests/test_pm_kisan_agent.py tests/test_flow_router.py -q`

Expected: PASS.

- [ ] **Step 3: Commit the PM-KISAN integration**

```bash
git add gov_agent/pm_kisan_agent.py tests/test_pm_kisan_agent.py tests/test_flow_router.py
git commit -m "refactor: route pm-kisan replies through text router"
```

### Task 6: Document Config and Verification Workflow

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document the new env format and limits**

```md
### Test-Only Text Provider Pool

Set `TEXT_LLM_PROVIDERS_JSON` to a JSON array describing the text/chat pool. This router is currently used only for text generation paths and does not cover OCR, document/image analysis, or embeddings.

Example:

```env
TEXT_LLM_PROVIDERS_JSON=[{"name":"groq-1","provider":"groq","model":"llama-3.1-8b-instant","api_key_env":"GROQ_API_KEY_1","enabled":true,"weight":3},{"name":"gemini-1","provider":"gemini","model":"gemini-2.0-flash","api_key_env":"GEMINI_API_KEY_1","enabled":true,"weight":2},{"name":"mistral-1","provider":"mistral","model":"mistral-small-latest","api_key_env":"MISTRAL_API_KEY_1","enabled":true,"weight":1}]
```
```

- [ ] **Step 2: Run a quick docs sanity check**

Run: `rg -n "TEXT_LLM_PROVIDERS_JSON|Test-Only Text Provider Pool" README.md`

Expected: two or more matches in the new documentation section.

- [ ] **Step 3: Commit the docs**

```bash
git add README.md
git commit -m "docs: add text router configuration guide"
```

### Task 7: Verification Before Merge

**Files:**
- Verify: `gov_agent/main.py`
- Verify: `frontend/pages/pmkisan.tsx`
- Verify: `frontend/lib/backendApi.mjs`

- [ ] **Step 1: Run scoped automated tests**

Run: `SUPABASE_URL=https://example.supabase.co SUPABASE_KEY=test-key SECRET_KEY=test GEMINI_API_KEY=test PYTHONPATH=. pytest tests/test_llm_text_router.py tests/test_pm_kisan_agent.py tests/test_flow_router.py -q`

Expected: PASS.

- [ ] **Step 2: Start the backend with real provider env**

Run: `PYTHONPATH=. uvicorn gov_agent.main:app --host 127.0.0.1 --port 8001`

Expected: server starts without import errors and initializes the text router.

- [ ] **Step 3: Start the frontend against the backend**

Run: `BACKEND_URL=http://127.0.0.1:8001 npm run build`

Run: `BACKEND_URL=http://127.0.0.1:8001 npm run start -- --hostname 127.0.0.1 --port 3001`

Expected: production frontend serves on `http://127.0.0.1:3001`.

- [ ] **Step 4: Verify a real user flow in the browser**

Use browser automation to:

- load `/pmkisan`
- submit a valid identifier
- confirm `POST /api/pm-kisan` returns `200`
- confirm a visible reply renders

Expected: end-to-end success through the router.

- [ ] **Step 5: Verify failover behavior**

Temporarily disable or invalidate the primary provider in `TEXT_LLM_PROVIDERS_JSON`, then rerun the `/pmkisan` browser flow.

Expected: the request still succeeds via another configured provider, or the feature returns the controlled fallback response if every provider is exhausted.

- [ ] **Step 6: Commit final implementation after verification**

```bash
git status
git add gov_agent/config.py gov_agent/flow_router.py gov_agent/main.py gov_agent/pm_kisan_agent.py gov_agent/llm_text_router.py gov_agent/providers tests/test_llm_text_router.py tests/test_pm_kisan_agent.py tests/test_flow_router.py README.md
git commit -m "feat: add multi-provider text router"
```
