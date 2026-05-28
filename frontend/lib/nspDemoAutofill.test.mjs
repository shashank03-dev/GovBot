import test from 'node:test';
import assert from 'node:assert/strict';

import {
  NSP_DEMO_DATA,
  NSP_DEMO_STEPS,
  buildNspDemoDataFromFillValues,
  getMissingNspDemoStepFields,
  shouldShowNspShowcaseFallbackNotice,
} from './nspDemoAutofill.mjs';

test('normal NSP demo autofill covers every visible field in the typing sequence', () => {
  assert.deepEqual(getMissingNspDemoStepFields(), []);

  const stepFields = NSP_DEMO_STEPS.map((step) => step.field);
  assert.ok(stepFields.includes('mobile'));
  assert.ok(stepFields.includes('email'));
  assert.ok(stepFields.includes('confirmAccountNo'));
  assert.ok(stepFields.includes('branch'));
  assert.equal(NSP_DEMO_DATA.income, '98000');
  assert.equal(NSP_DEMO_DATA.category, 'obc');
});

test('buildNspDemoDataFromFillValues merges analyzed profile values into the normal demo template', () => {
  const merged = buildNspDemoDataFromFillValues({
    name: 'Demo Citizen',
    mobile: '919876543210',
    email: '[email protected]',
    domicile: 'Karnataka',
    accountNo: '1234567890',
  });

  assert.equal(merged.name, 'Demo Citizen');
  assert.equal(merged.mobile, '919876543210');
  assert.equal(merged.email, '[email protected]');
  assert.equal(merged.domicile, 'Karnataka');
  assert.equal(merged.instituteState, 'Karnataka');
  assert.equal(merged.accountNo, '1234567890');
  assert.equal(merged.confirmAccountNo, '1234567890');
  assert.equal(merged.branch, NSP_DEMO_DATA.branch);
});

test('shouldShowNspShowcaseFallbackNotice detects when no applicant fields were supplied', () => {
  assert.equal(shouldShowNspShowcaseFallbackNotice({}), true);
  assert.equal(shouldShowNspShowcaseFallbackNotice({ name: '   ', unknown: 'ignored' }), true);
  assert.equal(shouldShowNspShowcaseFallbackNotice({ name: 'Demo Citizen' }), false);
  assert.equal(shouldShowNspShowcaseFallbackNotice({ accountNo: '1234567890' }), false);
});
