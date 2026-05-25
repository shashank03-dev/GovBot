import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSSPDraft, mergeSSPPrefill, resolveSSPLanguage, SSP_STEPS } from './sspDraft.mjs';

test('mergeSSPPrefill prefers manual edits over prefill values', () => {
  const merged = mergeSSPPrefill(
    { student_name: 'Manual Name', college_name: '' },
    { student_name: 'Prefill Name', college_name: 'SMVIT' },
  );

  assert.equal(merged.student_name, 'Manual Name');
  assert.equal(merged.college_name, 'SMVIT');
});

test('buildSSPDraft merges profile, digilocker, and saved draft with saved values winning', () => {
  const draft = buildSSPDraft({
    profile: { student_name: 'Profile Name', mobile: '9999999999' },
    prefill: { student_name: 'DigiLocker Name', aadhaar_number: '123412341234' },
    saved: { fields: { student_name: 'Manual Name' }, language: 'kn', current_step: 'step-3' },
  });

  assert.equal(draft.fields.student_name, 'Manual Name');
  assert.equal(draft.fields.aadhaar_number, '123412341234');
  assert.equal(draft.fields.mobile, '9999999999');
  assert.equal(draft.language, 'kn');
  assert.equal(draft.current_step, 'step-3');
  assert.equal(SSP_STEPS.length, 5);
});

test('resolveSSPLanguage prefers explicit browser choice over saved draft language', () => {
  assert.equal(resolveSSPLanguage({ preferredLanguage: 'kn', savedLanguage: 'en' }), 'kn');
  assert.equal(resolveSSPLanguage({ preferredLanguage: undefined, savedLanguage: 'kn' }), 'kn');
  assert.equal(resolveSSPLanguage({ preferredLanguage: undefined, savedLanguage: undefined }), 'en');
});
