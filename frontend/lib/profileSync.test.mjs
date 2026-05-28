import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPhoneLookupCandidates,
  normalizeIndianPhone,
  toLocalTenDigitPhone,
} from './phoneStorage.mjs';
import {
  hasProfileContent,
  mergeReviewIntoProfile,
} from './profileSync.mjs';

test('normalizeIndianPhone stores one canonical auth-safe phone format', () => {
  assert.equal(normalizeIndianPhone('9632363213'), '919632363213');
  assert.equal(normalizeIndianPhone('+91 96323 63213'), '919632363213');
  assert.equal(normalizeIndianPhone('09632363213'), '919632363213');
  assert.equal(normalizeIndianPhone('919632363213'), '919632363213');
  assert.equal(toLocalTenDigitPhone('919632363213'), '9632363213');
});

test('buildPhoneLookupCandidates keeps both legacy and canonical profile-sync phone keys', () => {
  assert.deepEqual(buildPhoneLookupCandidates('9632363213'), ['9632363213', '919632363213']);
  assert.deepEqual(buildPhoneLookupCandidates('919632363213'), ['919632363213']);
});

test('mergeReviewIntoProfile hydrates an empty profile from DigiLocker review data', () => {
  const merged = mergeReviewIntoProfile(
    {},
    {
      name: 'SHASHANK GOWDA T',
      dob: '2006-10-30',
      gender: 'Male',
      aadhaar_number: 'XXXX-XXXX-5424',
      address: 'Bangalore, Karnataka - 560073',
      income: 25000,
      caste: 'SC',
      marks_pct: 95.5,
    },
  );

  assert.equal(merged.profile.full_name, 'SHASHANK GOWDA T');
  assert.equal(merged.profile.aadhaar_last4, '5424');
  assert.equal(merged.profile.caste, 'sc');
  assert.equal(merged.profile.marks_pct, 95.5);
  assert.equal(hasProfileContent(merged.profile), true);
  assert.ok(merged.completeness_pct > 0);
  assert.equal(merged.missing_fields.includes('full_name'), false);
});
