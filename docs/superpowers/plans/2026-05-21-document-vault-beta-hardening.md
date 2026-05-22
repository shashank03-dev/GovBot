# Document Vault Beta Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the unified document vault for beta by preserving raw OCR separately from user edits, recording audit metadata, tightening auth and server-side validation, and preparing Supabase RLS/storage policy rollout.

**Architecture:** Keep `user_documents` as the main vault table, but split its data model into `ocr_extracted_data`, `user_corrected_data`, and an effective merged `extracted_data` for backward compatibility. Add document access logs and safer upload replacement sequencing in the backend, then tighten web document endpoints to require authenticated ownership while leaving WhatsApp/DigiLocker ingestion on the internal service path.

**Tech Stack:** FastAPI, Supabase Python client, Supabase Postgres/Storage, Next.js, React, TypeScript, unittest

---

### Task 1: Expand the vault schema

**Files:**
- Modify: `schema.sql`

- [ ] Add `ocr_extracted_data`, `user_corrected_data`, `source_confidence`, `status_reason`, `edited_by_user`, and `edited_at` to `user_documents`.
- [ ] Add `document_access_logs` for preview/edit/delete/reveal audit entries.
- [ ] Add RLS/storage policy scaffolding comments or SQL for Supabase rollout.

### Task 2: Preserve OCR and user corrections separately

**Files:**
- Modify: `gov_agent/document_vault.py`
- Test: `tests/test_document_vault.py`

- [ ] Keep raw OCR in `ocr_extracted_data`.
- [ ] Keep manual user edits in `user_corrected_data`.
- [ ] Continue returning merged `extracted_data` so current routes/UI do not break.
- [ ] Add tests covering split storage and merged reads.

### Task 3: Harden upload sequencing and file inspection

**Files:**
- Modify: `gov_agent/document_vault.py`
- Test: `tests/test_document_vault.py`

- [ ] Inspect file signatures server-side instead of trusting MIME type alone.
- [ ] Upload new file first, persist DB changes second, and delete the old storage object only after the DB write succeeds.
- [ ] Preserve the current overwrite-by-doc-type behavior.

### Task 4: Add audit logging and stronger web auth

**Files:**
- Modify: `gov_agent/document_vault.py`
- Modify: `gov_agent/doc_validator_router.py`
- Modify: `gov_agent/flow_router.py`

- [ ] Record preview, edit, delete, and sensitive-reveal actions in `document_access_logs`.
- [ ] Require authenticated ownership on web document routes instead of optional access.
- [ ] Keep internal ingestion paths working for WhatsApp and DigiLocker.

### Task 5: Verify and document Supabase follow-up

**Files:**
- Modify: `schema.sql`
- Modify: `tests/test_document_vault.py`
- Modify: `tests/test_profile_auth.py`

- [ ] Run backend tests and compile checks.
- [ ] Document the manual Supabase SQL/RLS follow-up that still needs to be applied in the hosted project.
