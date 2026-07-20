import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FORM_FILL_SAMPLE_TARGETS,
  buildDemoAliasAnalysis,
  buildNspFillValuesFromProfile,
  findFormFillTarget,
} from './formFillTargets.mjs';
import {
  NSP_DEMO_DATA,
  buildNspDemoDataFromFillValues,
  buildNspProfileDataFromFillValues,
  getMissingNspProfileFields,
} from './nspDemoAutofill.mjs';

// A profile with every field the NSP autofill needs.
const COMPLETE_PROFILE = {
  phone: '919876543210',
  full_name: 'Complete Citizen',
  dob: '01/01/2004',
  gender: 'Female',
  aadhaar_number: '1111 2222 3333',
  caste: 'sc',
  religion: 'hindu',
  email: 'complete@example.test',
  income: 120000,
  state: 'Kerala',
  district: 'Ernakulam',
  institution: 'Cochin College',
  course_name: 'Mechanical Engineering',
  academic_year: '2024',
  board: 'Kerala State Board',
  admission_date: '2024-07-15',
  marks_pct: 88.5,
  bank_name: 'Canara Bank',
  bank_account: '777788889999',
  bank_ifsc: 'CNRB0001111',
  bank_branch: 'Ernakulam Main',
};

test('findFormFillTarget resolves the official NSP sample to the demo alias target', () => {
  const target = findFormFillTarget('https://scholarships.gov.in/fresh/newstdRegfrmInstruction');

  assert.equal(target?.key, 'nsp-demo');
  assert.equal(target?.mode, 'demo_alias');
  assert.equal(target?.resolvedPath, '/nsp/apply');
});

test('sample targets include a safe public live-demo form', () => {
  const target = FORM_FILL_SAMPLE_TARGETS.find((item) => item.key === 'dummy-address');

  assert.equal(target?.mode, 'live_site');
  assert.equal(target?.displayUrl, 'https://thedummysite.com/address');
});

test('buildDemoAliasAnalysis exposes proof metadata and missing profile fields', () => {
  const analysis = buildDemoAliasAnalysis(
    FORM_FILL_SAMPLE_TARGETS[0],
    {
      full_name: 'Demo Citizen',
      email: '[email protected]',
      phone: '919876543210',
      state: 'Karnataka',
    },
    'http://127.0.0.1:3000',
  );

  assert.equal(analysis.display_url, 'https://scholarships.gov.in/fresh/newstdRegfrmInstruction');
  assert.equal(analysis.resolved_url, 'http://127.0.0.1:3000/nsp/apply?autostart=1&source=form-fill');
  assert.equal(analysis.resolution_mode, 'demo_alias');
  assert.ok(analysis.form_fields.length > 10);
  assert.equal(analysis.fill_values.name, 'Demo Citizen');
  assert.equal(analysis.fill_values.mobile, '919876543210');
  assert.equal(analysis.fill_values.email, '[email protected]');
  assert.ok(analysis.missing_fields.includes('dob'));
});

test('a complete profile supplies every NSP autofill field with no demo fallback', () => {
  const fillValues = buildNspFillValuesFromProfile(COMPLETE_PROFILE);
  const unmapped = Object.keys(NSP_DEMO_DATA).filter((field) => !(field in fillValues));

  assert.deepEqual(unmapped, [], `NSP fields not covered by the profile: ${unmapped.join(', ')}`);
});

test('profile values map onto the correct NSP form fields', () => {
  const merged = buildNspDemoDataFromFillValues(buildNspFillValuesFromProfile(COMPLETE_PROFILE));

  assert.equal(merged.name, 'Complete Citizen');
  assert.equal(merged.aadhaar, '1111 2222 3333');
  assert.equal(merged.category, 'sc');
  assert.equal(merged.course, 'Mechanical Engineering');
  assert.equal(merged.year, '2024');
  assert.equal(merged.board, 'Kerala State Board');
  assert.equal(merged.admissionDate, '2024-07-15');
  assert.equal(merged.branch, 'Ernakulam Main');
  assert.equal(merged.instituteState, 'Kerala');
  assert.equal(merged.accountHolder, 'Complete Citizen');
  assert.equal(merged.confirmAccountNo, '777788889999');
});

test('an empty profile falls back to the demo template for every field', () => {
  const merged = buildNspDemoDataFromFillValues(buildNspFillValuesFromProfile({}));

  assert.deepEqual(merged, NSP_DEMO_DATA);
});

test('a partial profile keeps real values and fills the rest from the demo template', () => {
  const merged = buildNspDemoDataFromFillValues(
    buildNspFillValuesFromProfile({ full_name: 'Partial Citizen', bank_branch: 'Some Branch' }),
  );

  assert.equal(merged.name, 'Partial Citizen');
  assert.equal(merged.branch, 'Some Branch');
  assert.equal(merged.course, NSP_DEMO_DATA.course);
  assert.equal(merged.aadhaar, NSP_DEMO_DATA.aadhaar);
});

test('profile-driven fill never substitutes a demo value for a missing field', () => {
  const partial = buildNspFillValuesFromProfile({ full_name: 'Real Citizen', state: 'Kerala' });
  const filled = buildNspProfileDataFromFillValues(partial);

  assert.equal(filled.name, 'Real Citizen');
  assert.equal(filled.instituteState, 'Kerala');
  // Anything the profile lacks must be blank, not borrowed from NSP_DEMO_DATA.
  assert.equal(filled.aadhaar, '');
  assert.equal(filled.course, '');
  assert.equal(filled.branch, '');
  assert.equal(filled.income, '');
});

test('profile-driven fill of a complete profile leaves nothing missing', () => {
  const fillValues = buildNspFillValuesFromProfile(COMPLETE_PROFILE);

  assert.deepEqual(getMissingNspProfileFields(fillValues), []);
});

test('getMissingNspProfileFields reports exactly what the profile still lacks', () => {
  const missing = getMissingNspProfileFields(
    buildNspFillValuesFromProfile({ full_name: 'Real Citizen' }),
  );

  assert.ok(missing.includes('aadhaar'));
  assert.ok(missing.includes('branch'));
  assert.ok(!missing.includes('name'));
  assert.ok(!missing.includes('accountHolder'), 'accountHolder is derived from name');
});

test('demo fixtures contain no real personal data', () => {
  assert.equal(NSP_DEMO_DATA.email.endsWith('.test'), true);
  assert.match(NSP_DEMO_DATA.aadhaar, /^9999 /);
});
