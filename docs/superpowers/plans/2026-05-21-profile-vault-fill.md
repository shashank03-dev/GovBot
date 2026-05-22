# Profile Vault Fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a profile quick action that fills profile fields from the unified vault and warns the user about fields still missing.

**Architecture:** Extend the profile router with a vault-backed merge route that reuses existing document mapping logic and preserves user-entered values. Update the profile page to call the route and show a focused missing-data alert after the fill.

**Tech Stack:** FastAPI, Supabase Python client, Next.js, React, TypeScript, unittest

---

### Task 1: Add backend regression tests

**Files:**
- Modify: `tests/test_profile_auth.py`
- Test: `tests/test_profile_auth.py`

- [ ] Write unit tests for collecting profile updates from vault documents.
- [ ] Run the focused test command and verify the new tests fail first.
- [ ] Implement the minimal backend helper code to satisfy the tests.
- [ ] Run the focused test command again and verify it passes.

### Task 2: Add profile vault-fill endpoint

**Files:**
- Modify: `gov_agent/profile_router.py`

- [ ] Add helper functions for allowed profile fields, vault update collection, and empty-field merge logic.
- [ ] Add `POST /{phone}/from-vault` that loads vault docs, merges updates, and returns `ProfileResponse`.
- [ ] Keep auth behavior consistent with existing profile routes.

### Task 3: Add profile-page quick action and alert

**Files:**
- Modify: `frontend/pages/profile.tsx`

- [ ] Add `vaultLoading` and `vaultAlert` UI state.
- [ ] Add the `Auto-fill from Vault` quick-action button.
- [ ] Call the new backend route, refresh the profile, and show success/error toasts.
- [ ] Show a warning alert block when missing fields remain after vault fill.

### Task 4: Verify end to end

**Files:**
- Modify: `gov_agent/profile_router.py`
- Modify: `frontend/pages/profile.tsx`
- Modify: `tests/test_profile_auth.py`

- [ ] Run the backend-focused test command.
- [ ] Run any relevant frontend or type-check command available for the repo if practical.
- [ ] Review the changed UX copy and confirm it matches the requested fast vault-fill behavior.
