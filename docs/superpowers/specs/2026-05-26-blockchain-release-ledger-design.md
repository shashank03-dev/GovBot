# Blockchain Release Ledger Design

## Goal

Add a production-style scholarship fund release workflow where a government official logs into GOVbot, connects a whitelisted browser wallet, receives sanctioned scheme funds on a real testnet, authorizes release batches on-chain, and exposes the release state to both citizens and applicants through GOVbot.

## Scope

- Extend the existing official workflow instead of creating a separate blockchain microsite.
- Use a real browser wallet flow with real testnet transaction hashes and explorer links.
- Treat blockchain as the authorization and public audit layer, not the bank payout rail.
- Add scheme-wise sanctioned balances and release controls for scholarship workflows such as `NSP` and `SSP`.
- Add a public transparency ledger page for aggregate release visibility.
- Add applicant notifications and status updates when funds are released.
- Add a bank-verification dependency so applicants without a verified bank account are prompted to complete verification before payout.

## Non-Goals

- Moving student payouts directly on-chain
- Supporting arbitrary wallet connections for any visitor
- Building a general crypto wallet product inside GOVbot
- Replacing the existing bank verification or disbursement state model
- Implementing multi-sig governance in the first pass

## Approved User Flow

1. An official signs in through the existing `/official-login` page.
2. The official opens `/gov-dashboard/disbursements`, now expanded into a treasury release console.
3. The official connects a pre-approved browser wallet that is mapped to the department release role.
4. GOVbot shows sanctioned balances by scheme that originate from a higher-authority sanction transaction on a real testnet.
5. The official selects a scheme release batch such as `NSP` or `SSP` and reviews beneficiary counts, ready-for-payout counts, and blocked counts.
6. The official signs the release action with the connected wallet.
7. GOVbot stores the transaction hash, scheme, amount, authority, timestamp, and beneficiary totals as immutable release evidence.
8. Applicants with verified bank details move into the normal payout queue.
9. Applicants without verified bank details are marked as release-authorized but payout-blocked and are urged to complete `/bank-verify`.
10. Citizens can open a public transparency page and inspect release facts, including the real transaction hash.

## Product Surfaces

### `/official-login`

- Keep the existing official username and password flow.
- Treat wallet connection as a second step required only for treasury release actions.
- Do not replace official login with wallet-only access.

### `/gov-dashboard/disbursements`

Add a `Treasury Release Console` within the existing disbursement dashboard. It should show:

- connected wallet status
- whitelisted wallet mismatch state
- sanctioned balance per scheme
- total beneficiaries in the selected batch
- applicants ready for payout
- applicants blocked by missing bank verification
- latest sanction hash
- latest release hash
- explorer links for both sanction and release records

It should also expose the release action while preventing arbitrary transfers or free-form recipient entry.

### `/wallet`

- Keep this as the beneficiary-facing scholarship wallet and history view.
- Reposition it away from being the official treasury wallet.
- Show released scholarship records, verification links, and payout readiness states for the signed-in applicant.

### `/bank-verify`

- Keep the existing bank verification surface.
- Add urgent copy when scholarship funds are already released but the applicant is still blocked from payout.
- After successful verification, move the applicant into the next eligible payout run without requiring a second blockchain release.

### New public route: `/transparency`

Add a citizen-facing release ledger page that shows:

- scheme
- sanctioned amount
- released amount
- releasing authority
- release date and time
- sanction transaction hash
- release transaction hash
- batch status
- count blocked by pending bank verification

This route must avoid exposing personal bank details or full beneficiary identity data.

## Authorization And Governance Model

- Funds originate from a higher authority and appear as `Central Treasury -> Department Release Wallet`.
- Only whitelisted wallet addresses linked to the official release role can authorize release batches.
- Scheme balances are isolated. A sanctioned `NSP` balance cannot be used to release `SSP` funds.
- The UI must not allow arbitrary wallet transfers, manual address entry, or off-scope withdrawal actions.
- Every sanction and release event must be stored with authority name, wallet address, scheme, amount, timestamp, status, and transaction hash.
- Any failed or rejected release attempt must be logged for audit purposes.

## Blockchain Model

- Use a real public testnet for demo credibility.
- Use browser wallet signing for release authorization.
- Anchor sanction and release records on-chain and surface the real hash inside GOVbot.
- Treat on-chain state as the proof of authorization and public audit trail.
- Keep actual beneficiary crediting inside the existing payout workflow rather than sending scholarship funds directly to student wallets.

## Data And State Model

GOVbot remains the operational source of truth for:

- applicant identity and application records
- bank verification status
- payout eligibility
- notification history
- dashboard summaries and release drill-downs

Blockchain-linked records add:

- sanctioned treasury events
- release batch authorization events
- wallet addresses used for authorization
- explorer URLs and transaction hashes

The payout pipeline should derive per-applicant release state from both sources:

- `release_authorized`
- `release_authorized_bank_pending`
- `release_authorized_payout_ready`
- `payout_processing`
- `payout_credited`

## Notification Rules

When a release batch succeeds:

- Applicants with verified bank details receive a notification that scholarship funds were released and bank credit is being processed.
- Applicants without verified bank details receive a notification that scholarship funds were released but bank verification is pending.
- The pending-verification notification must direct the user to `/bank-verify` and explain that payout cannot proceed until the bank account is verified.
- The applicant dashboard and wallet history should reflect the same status wording used in notifications.

## Citizen Transparency Rules

- The public ledger must show aggregate release facts and real transaction references.
- Citizens should be able to see that a release happened, when it happened, who released it, and which scheme it covered.
- The ledger should also show that some beneficiaries may still be pending bank verification.
- The ledger must not expose bank account numbers, raw applicant phone numbers, or full personally identifiable release lists.

## Failure And Guardrail States

The workflow must block or clearly surface:

- unconnected wallet state
- wrong wallet connected for the logged-in authority
- insufficient sanctioned balance for the selected scheme
- chain transaction rejection by the wallet
- chain transaction failure after submission
- release attempts against an empty or already processed batch

If an on-chain release fails, GOVbot must not mark the batch as released or notify applicants as if release succeeded.

## Demo Credibility Rules

- Never show placeholder hashes, fake explorer links, or copy that says the blockchain flow is simulated.
- If a release hash is shown, it must resolve on the chosen testnet explorer.
- If a scheme balance is shown, it must be derived from GOVbot release state tied to actual sanction and release records.
- The official release story should be framed as a department-controlled wallet, not a personal wallet.

## Validation

- Frontend tests for wallet-gated official release state, release summaries, and transparency ledger rendering
- Backend tests for whitelisted-wallet enforcement, scheme-balance guardrails, release logging, and notification branching on bank verification state
- Narrow feature tests first, then `make check`
- Browser verification with `make dev` across `/official-login`, `/gov-dashboard/disbursements`, `/transparency`, `/wallet`, and `/bank-verify`
