import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FORM_FILL_SAMPLE_TARGETS,
  buildDemoAliasAnalysis,
  findFormFillTarget,
} from './formFillTargets.mjs';

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
