import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDashboardPhonePath,
  decodePhoneFromToken,
  normalizePhone,
  resolveDashboardPhone,
} from './dashboardSession.mjs';

function buildToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.signature`;
}

test('resolveDashboardPhone prefers explicit query phone and normalizes formatting', () => {
  assert.equal(
    resolveDashboardPhone({
      queryPhone: '+91 96323 63213',
      storedPhone: '1111111111',
      token: buildToken({ phone: '2222222222' }),
    }),
    '919632363213',
  );
});

test('resolveDashboardPhone falls back to stored phone and token payload', () => {
  assert.equal(resolveDashboardPhone({ storedPhone: ' 919632363213 ' }), '919632363213');
  assert.equal(resolveDashboardPhone({ token: buildToken({ phone: '919632363213' }) }), '919632363213');
  assert.equal(resolveDashboardPhone({ token: buildToken({ sub: '+91 9632363213' }) }), '919632363213');
});

test('dashboard phone helpers reject unusable values', () => {
  assert.equal(normalizePhone(''), '');
  assert.equal(decodePhoneFromToken('not-a-jwt'), '');
  assert.equal(buildDashboardPhonePath(''), '/dashboard');
  assert.equal(buildDashboardPhonePath('+91 9632363213'), '/dashboard?phone=919632363213');
});
