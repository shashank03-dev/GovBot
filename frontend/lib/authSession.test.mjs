import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CITIZEN_SESSION_COOKIE_NAME,
  OFFICIAL_SESSION_COOKIE_NAME,
  shouldReplaceAuthorizationHeader,
  parseCookieHeader,
  resolveSessionAuthorizationHeader,
} from './authSession.mjs';

test('parseCookieHeader parses individual cookie values', () => {
  assert.deepEqual(
    parseCookieHeader(`${CITIZEN_SESSION_COOKIE_NAME}=citizen-token; ${OFFICIAL_SESSION_COOKIE_NAME}=official-token`),
    {
      [CITIZEN_SESSION_COOKIE_NAME]: 'citizen-token',
      [OFFICIAL_SESSION_COOKIE_NAME]: 'official-token',
    },
  );
});

test('shouldReplaceAuthorizationHeader treats local placeholder markers as non-credentials', () => {
  assert.equal(shouldReplaceAuthorizationHeader('Bearer cookie-session'), true);
  assert.equal(shouldReplaceAuthorizationHeader('Bearer cookie-official-session'), true);
  assert.equal(shouldReplaceAuthorizationHeader('Bearer real.jwt.token'), false);
});

test('resolveSessionAuthorizationHeader injects the citizen session cookie for citizen endpoints', () => {
  const req = {
    headers: {
      cookie: `${CITIZEN_SESSION_COOKIE_NAME}=citizen-real-token`,
    },
  };

  assert.equal(
    resolveSessionAuthorizationHeader({
      req,
      backendPath: '/profile/919999999999',
      authorizationHeader: 'Bearer cookie-session',
    }),
    'Bearer citizen-real-token',
  );
});

test('resolveSessionAuthorizationHeader injects the official session cookie for official endpoints', () => {
  const req = {
    headers: {
      cookie: `${OFFICIAL_SESSION_COOKIE_NAME}=official-real-token`,
    },
  };

  assert.equal(
    resolveSessionAuthorizationHeader({
      req,
      backendPath: '/api/analytics/overview',
      authorizationHeader: '',
    }),
    'Bearer official-real-token',
  );
});
