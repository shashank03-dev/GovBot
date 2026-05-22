# Profile Vault Fill Design

## Goal

Add a fast way on the profile page to pull citizen details from the unified document vault and surface what is still missing after the fill.

## Scope

- Add a profile API action that reads latest vault documents for a phone number.
- Map document data into profile fields using the existing document-vault mapping rules.
- Only fill empty profile fields so manual edits are preserved.
- Refresh profile completeness and missing-fields data after the fill.
- Show a dedicated profile-page alert when the vault fill still leaves missing fields.

## Backend Design

- Add `POST /profile/{phone}/from-vault` in `gov_agent/profile_router.py`.
- Read latest document rows from `user_documents` for the phone number.
- Reuse `build_profile_updates()` from `gov_agent.document_vault`.
- Filter updates down to fields the citizen profile actually uses.
- Merge only into currently empty profile fields.
- Return the standard `ProfileResponse`.

## Frontend Design

- Add an `Auto-fill from Vault` quick action on `frontend/pages/profile.tsx`.
- Call the new backend route and reuse `applyProfileData()` on success.
- Show a success toast if data is imported.
- Show a warning alert card if missing fields remain after the fill.

## Error Handling

- If no useful vault data exists, return `404`.
- If the vault has documents but no profile-mappable fields, return `422`.
- Keep the existing auth guard behavior for profile routes.

## Testing

- Add unit tests for vault document mapping and empty-field-only merge behavior in `tests/test_profile_auth.py`.
