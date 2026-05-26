# Blockchain Release Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real-wallet scholarship release workflow on Polygon Amoy with an official treasury console, a public transparency ledger, and beneficiary bank-verification follow-up.

**Architecture:** Keep blockchain responsibility narrow: the browser wallet submits a real Amoy transaction that anchors the release metadata, while GOVbot stores sanctions and release records in a dedicated treasury ledger file and derives beneficiary readiness from existing `applications`, `bank_verifications`, and `disbursement_tracking` data. Surface the same release state across the official disbursement dashboard, the public transparency page, the beneficiary wallet, and the bank verification page.

**Tech Stack:** FastAPI, Next.js pages router, React 19, TypeScript, Node test runner, pytest, EIP-1193 browser wallet APIs

---

## File Structure

### Backend

- Create: `gov_agent/treasury_release.py`
- Create: `gov_agent/treasury_router.py`
- Modify: `gov_agent/config.py`
- Modify: `gov_agent/main.py`
- Modify: `gov_agent/npci_agent.py`
- Create: `tests/test_treasury_router.py`

### Frontend

- Create: `frontend/lib/treasuryRelease.mjs`
- Create: `frontend/lib/treasuryRelease.test.mjs`
- Modify: `frontend/lib/backendApi.mjs`
- Create: `frontend/components/gov-dashboard/TreasuryReleasePanel.tsx`
- Create: `frontend/pages/transparency.tsx`
- Modify: `frontend/pages/gov-dashboard/disbursements.tsx`
- Modify: `frontend/pages/wallet/index.tsx`
- Modify: `frontend/pages/bank-verify.tsx`

## Critical Review Before Start

- The implementation avoids a Supabase schema migration by using a dedicated treasury ledger file plus existing database tables for applicant and payout readiness.
- The implementation uses a real Amoy transaction hash for release proof, but it does not attempt to move student funds on-chain.
- The implementation keeps the official login as the primary access gate and uses the browser wallet only for release authorization.

### Task 1: Add Treasury Ledger Backend State And APIs

**Files:**
- Create: `gov_agent/treasury_release.py`
- Create: `gov_agent/treasury_router.py`
- Modify: `gov_agent/config.py`
- Modify: `gov_agent/main.py`
- Create: `tests/test_treasury_router.py`

- [ ] **Step 1: Write the failing backend treasury tests**

```python
def test_treasury_summary_returns_scheme_balances_for_authorized_official(client, official_headers, ledger_file):
    response = client.get("/api/treasury/summary", headers=official_headers)
    assert response.status_code == 200
    payload = response.json()
    assert "schemes" in payload
    assert "wallet" in payload

def test_release_rejects_unapproved_wallet(client, official_headers, ledger_file):
    response = client.post(
        "/api/treasury/release",
        headers=official_headers,
        json={
            "scheme": "nsp",
            "tx_hash": "0xabc123",
            "wallet_address": "0x0000000000000000000000000000000000000001",
        },
    )
    assert response.status_code == 403

def test_public_transparency_feed_returns_release_rows_without_auth(client, ledger_file):
    response = client.get("/api/treasury/releases/public")
    assert response.status_code == 200
    assert "releases" in response.json()

def test_beneficiary_status_flags_bank_verification_when_release_exists(client, ledger_file):
    response = client.get("/api/treasury/beneficiary/919632363213")
    assert response.status_code == 200
    payload = response.json()
    assert payload["release_authorized"] is True
    assert payload["action_required"] == "verify_bank"
```

- [ ] **Step 2: Run the backend treasury tests to verify they fail**

Run: `pytest -q tests/test_treasury_router.py`

Expected: FAIL because the treasury router and ledger helpers do not exist yet.

- [ ] **Step 3: Write the minimal backend treasury implementation**

```python
# gov_agent/config.py
TREASURY_CHAIN_ID = int(os.getenv("TREASURY_CHAIN_ID", "80002"))
TREASURY_NETWORK_NAME = os.getenv("TREASURY_NETWORK_NAME", "Polygon Amoy")
TREASURY_EXPLORER_BASE_URL = os.getenv("TREASURY_EXPLORER_BASE_URL", "https://amoy.polygonscan.com/tx/")
TREASURY_APPROVED_WALLET = os.getenv("TREASURY_APPROVED_WALLET", "").lower()
TREASURY_RELEASE_ANCHOR_ADDRESS = os.getenv("TREASURY_RELEASE_ANCHOR_ADDRESS", "")
TREASURY_LEDGER_FILE = os.getenv("TREASURY_LEDGER_FILE", "/tmp/govbot-treasury-ledger.json")
TREASURY_SANCTIONS_JSON = os.getenv("TREASURY_SANCTIONS_JSON", "[]")
```

```python
# gov_agent/treasury_release.py
def load_ledger() -> dict: ...
def save_ledger(data: dict) -> None: ...
def build_treasury_summary(official: dict[str, str]) -> dict: ...
def record_release(official: dict[str, str], tx_hash: str, wallet_address: str, scheme: str) -> dict: ...
def build_public_release_feed() -> dict: ...
def get_beneficiary_release_status(phone: str) -> dict: ...
```

```python
# gov_agent/treasury_router.py
@router.get("/treasury/summary")
async def get_treasury_summary(official=Depends(require_official_auth)):
    return treasury_release.build_treasury_summary(official)

@router.post("/treasury/release")
async def create_release(body: ReleaseRequest, official=Depends(require_official_auth)):
    return treasury_release.record_release(official, body.tx_hash, body.wallet_address, body.scheme)

@router.get("/treasury/releases/public")
async def get_public_release_feed():
    return treasury_release.build_public_release_feed()

@router.get("/treasury/beneficiary/{phone}")
async def get_beneficiary_release(phone: str):
    return treasury_release.get_beneficiary_release_status(phone)
```

- [ ] **Step 4: Run the backend treasury tests to verify they pass**

Run: `pytest -q tests/test_treasury_router.py`

Expected: PASS.

- [ ] **Step 5: Commit the backend treasury slice**

```bash
git add gov_agent/config.py gov_agent/main.py gov_agent/treasury_release.py gov_agent/treasury_router.py tests/test_treasury_router.py
git commit -m "feat: add treasury release backend"
```

### Task 2: Add Frontend Treasury Helper Logic And Proxy Support

**Files:**
- Create: `frontend/lib/treasuryRelease.mjs`
- Create: `frontend/lib/treasuryRelease.test.mjs`
- Modify: `frontend/lib/backendApi.mjs`

- [ ] **Step 1: Write the failing frontend treasury helper tests**

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExplorerTransactionUrl,
  buildReleaseReference,
  isApprovedTreasuryWallet,
  resolveBeneficiaryReleaseMessage,
} from './treasuryRelease.mjs';

test('buildExplorerTransactionUrl normalizes the base path', () => {
  assert.equal(
    buildExplorerTransactionUrl('https://amoy.polygonscan.com/tx', '0xabc'),
    'https://amoy.polygonscan.com/tx/0xabc',
  );
});

test('isApprovedTreasuryWallet compares case-insensitively', () => {
  assert.equal(
    isApprovedTreasuryWallet('0xAbC', '0xabc'),
    true,
  );
});

test('resolveBeneficiaryReleaseMessage marks bank verification as urgent when release is blocked', () => {
  assert.match(
    resolveBeneficiaryReleaseMessage({ release_authorized: true, action_required: 'verify_bank' }),
    /verify bank/i,
  );
});
```

- [ ] **Step 2: Run the frontend treasury helper tests to verify they fail**

Run: `cd frontend && npm test -- treasuryRelease.test.mjs`

Expected: FAIL because the treasury helper module does not exist yet.

- [ ] **Step 3: Write the minimal frontend treasury helper implementation**

```javascript
// frontend/lib/treasuryRelease.mjs
export function buildExplorerTransactionUrl(baseUrl, txHash) { ... }
export function isApprovedTreasuryWallet(address, approvedAddress) { ... }
export function buildReleaseReference({ scheme, amountInr, beneficiaryCount, officialUsername, createdAt }) { ... }
export function resolveBeneficiaryReleaseMessage(status) { ... }
export function buildReleaseTransactionRequest({ from, to, dataHex }) { ... }
```

```javascript
// frontend/lib/backendApi.mjs
const prefixMap = [
  ...,
  ['treasury/', '/api/treasury/'],
];
```

- [ ] **Step 4: Run the frontend treasury helper tests to verify they pass**

Run: `cd frontend && npm test -- treasuryRelease.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the frontend treasury helper slice**

```bash
git add frontend/lib/backendApi.mjs frontend/lib/treasuryRelease.mjs frontend/lib/treasuryRelease.test.mjs
git commit -m "feat: add treasury frontend helpers"
```

### Task 3: Add Treasury Release Console, Transparency Page, And Beneficiary Status

**Files:**
- Create: `frontend/components/gov-dashboard/TreasuryReleasePanel.tsx`
- Create: `frontend/pages/transparency.tsx`
- Modify: `frontend/pages/gov-dashboard/disbursements.tsx`
- Modify: `frontend/pages/wallet/index.tsx`
- Modify: `frontend/pages/bank-verify.tsx`
- Modify: `gov_agent/npci_agent.py`

- [ ] **Step 1: Write the failing beneficiary and release-state tests**

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveBeneficiaryReleaseMessage } from './treasuryRelease.mjs';

test('beneficiary release message confirms payout processing for verified accounts', () => {
  assert.match(
    resolveBeneficiaryReleaseMessage({ release_authorized: true, action_required: 'none' }),
    /processing/i,
  );
});
```

```python
def test_record_release_updates_ready_disbursements_to_processing(...):
    ...
    assert updated_payload["status"] == "processing"
```

- [ ] **Step 2: Run the targeted tests to verify they fail**

Run: `pytest -q tests/test_treasury_router.py -k processing`

Run: `cd frontend && npm test -- treasuryRelease.test.mjs`

Expected: FAIL because release-side applicant status propagation is not implemented yet.

- [ ] **Step 3: Write the minimal UI and payout-state implementation**

```python
# gov_agent/npci_agent.py
def mark_release_processing(phone: str, confirmation_number: str) -> None:
    ...
```

```tsx
// frontend/components/gov-dashboard/TreasuryReleasePanel.tsx
export default function TreasuryReleasePanel({ summary, officialUsername, onReleased }) {
  // connect EIP-1193 wallet, switch to Amoy, send zero-value anchor transaction, then POST /api/treasury/release
}
```

```tsx
// frontend/pages/transparency.tsx
export default function TransparencyPage() {
  // fetch /api/treasury/releases/public and render the public sanction + release ledger
}
```

```tsx
// frontend/pages/wallet/index.tsx
// fetch /api/treasury/beneficiary/{phone} and add a release status card above the credential list
```

```tsx
// frontend/pages/bank-verify.tsx
// fetch /api/treasury/beneficiary/{phone} after mount and show urgent copy when action_required === 'verify_bank'
```

- [ ] **Step 4: Run the targeted tests to verify they pass**

Run: `pytest -q tests/test_treasury_router.py`

Run: `cd frontend && npm test -- treasuryRelease.test.mjs officialSession.test.mjs dashboardRealtime.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the release console and beneficiary slice**

```bash
git add gov_agent/npci_agent.py frontend/components/gov-dashboard/TreasuryReleasePanel.tsx frontend/pages/transparency.tsx frontend/pages/gov-dashboard/disbursements.tsx frontend/pages/wallet/index.tsx frontend/pages/bank-verify.tsx
git commit -m "feat: add treasury release console and transparency surfaces"
```

### Task 4: Verify The Workflow End-To-End

**Files:**
- Modify: `docs/superpowers/plans/2026-05-26-blockchain-release-ledger.md`

- [ ] **Step 1: Run the narrow backend and frontend targets**

Run: `pytest -q tests/test_treasury_router.py`

Run: `cd frontend && npm test -- treasuryRelease.test.mjs officialSession.test.mjs dashboardRealtime.test.mjs`

Expected: PASS.

- [ ] **Step 2: Run the repo completion gate**

Run: `make check`

Expected: PASS.

- [ ] **Step 3: Run the app for browser verification**

Run: `make dev`

Expected: backend at `http://127.0.0.1:8000/govbot/health` and frontend at `http://127.0.0.1:3000`.

- [ ] **Step 4: Verify the key routes in the browser**

Run through:
- `/official-login`
- `/gov-dashboard/disbursements`
- `/transparency`
- `/wallet`
- `/bank-verify`

Expected:
- official login still works
- treasury console shows sanctioned balances and wallet state
- transparency page shows public release rows
- wallet shows beneficiary release status
- bank verify page shows urgent follow-up when release exists but bank verification is pending

- [ ] **Step 5: Commit the verified branch state**

```bash
git add docs/superpowers/plans/2026-05-26-blockchain-release-ledger.md
git commit -m "docs: record blockchain release ledger implementation plan"
```
