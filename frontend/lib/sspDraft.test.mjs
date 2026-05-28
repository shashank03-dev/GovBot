import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGovBotSSPApplyFields,
  buildGovBotSSPApplyAnimationSteps,
  buildSSPDraft,
  hasSSPApplySession,
  isSSPStepComplete,
  mergeSSPPrefill,
  resolveSSPLanguage,
  shouldShowSSPShowcaseFallbackNotice,
  SSP_STEPS,
} from './sspDraft.mjs';

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

test('buildGovBotSSPApplyFields creates a complete submitted SSP demo draft', () => {
  const fields = buildGovBotSSPApplyFields({
    student_name: 'Manual Student',
    college_name: 'Manual College',
    final_declaration_accepted: false,
  });

  assert.equal(fields.student_name, 'Manual Student');
  assert.equal(fields.college_name, 'Manual College');
  assert.equal(fields.final_declaration_accepted, true);
  assert.equal(fields.aadhaar_number, '123412341234');
  assert.equal(fields.course_name, 'B.E Computer Science');
  assert.equal(fields.e_attestation_status, 'Verified');
  assert.equal(fields.hostel_or_day_scholar, 'DayScholar');
  assert.equal(SSP_STEPS.every((step) => isSSPStepComplete(step.id, fields)), true);
});

test('hasSSPApplySession requires both stored phone and auth token marker', () => {
  assert.equal(hasSSPApplySession('919999999999', 'cookie-session'), true);
  assert.equal(hasSSPApplySession('919999999999', ''), false);
  assert.equal(hasSSPApplySession('', 'cookie-session'), false);
  assert.equal(hasSSPApplySession('919999999999', 'cookie-session', 'Draft request failed with 401'), false);
});

test('buildGovBotSSPApplyAnimationSteps progressively completes SSP sections', () => {
  const steps = buildGovBotSSPApplyAnimationSteps({
    student_name: 'Manual Student',
    college_name: 'Manual College',
  });
  let animatedFields = {};

  assert.deepEqual(
    steps.map((step) => step.stepId),
    ['step-1', 'step-2', 'step-3', 'step-4', 'step-5'],
  );

  for (const step of steps) {
    animatedFields = { ...animatedFields, ...step.fields };
    assert.equal(isSSPStepComplete(step.stepId, animatedFields), true);
    assert.ok(step.entries.length > 0);
  }

  assert.equal(animatedFields.student_name, 'Manual Student');
  assert.equal(animatedFields.college_name, 'Manual College');
  assert.equal(animatedFields.final_declaration_accepted, true);
  assert.equal(SSP_STEPS.every((step) => isSSPStepComplete(step.id, animatedFields)), true);
});

test('shouldShowSSPShowcaseFallbackNotice ignores defaults and detects missing applicant data', () => {
  assert.equal(shouldShowSSPShowcaseFallbackNotice(buildSSPDraft().fields), true);
  assert.equal(
    shouldShowSSPShowcaseFallbackNotice({
      domicile_state: 'Karnataka',
      academic_year: '2025-26',
      disability_status: 'No',
    }),
    true,
  );
  assert.equal(shouldShowSSPShowcaseFallbackNotice({ student_name: 'Manual Student' }), false);
  assert.equal(shouldShowSSPShowcaseFallbackNotice({ college_name: 'Manual College' }), false);
});
