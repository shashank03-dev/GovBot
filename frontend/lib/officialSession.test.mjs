import test from 'node:test';
import assert from 'node:assert/strict';

const officialSession = await import('./officialSession.mjs').catch(() => null);

test('official session helpers are defined', () => {
  assert.ok(officialSession, 'expected official session helper module to exist');
  assert.equal(typeof officialSession.sanitizeOfficialNextPath, 'function');
  assert.equal(typeof officialSession.buildOfficialLoginHref, 'function');
  assert.equal(typeof officialSession.resolveOfficialSessionState, 'function');
});

test('sanitizeOfficialNextPath keeps only protected official destinations', () => {
  assert.equal(officialSession.sanitizeOfficialNextPath('/gov-dashboard'), '/gov-dashboard');
  assert.equal(officialSession.sanitizeOfficialNextPath('/gov-dashboard/fraud'), '/gov-dashboard/fraud');
  assert.equal(officialSession.sanitizeOfficialNextPath('/admin'), '/admin');
  assert.equal(officialSession.sanitizeOfficialNextPath('/documents'), '/gov-dashboard');
  assert.equal(officialSession.sanitizeOfficialNextPath('https://example.com/admin'), '/gov-dashboard');
});

test('buildOfficialLoginHref preserves an allowed next path', () => {
  assert.equal(
    officialSession.buildOfficialLoginHref('/admin'),
    '/official-login?next=%2Fadmin',
  );
});

test('resolveOfficialSessionState checks for a stored official token', () => {
  const withToken = {
    getItem(key) {
      return key === officialSession.OFFICIAL_SESSION_STORAGE_KEY ? 'official-token' : null;
    },
  };
  const withoutToken = {
    getItem() {
      return null;
    },
  };

  assert.equal(
    officialSession.resolveOfficialSessionState({ hasMounted: true, storage: withToken }),
    true,
  );
  assert.equal(
    officialSession.resolveOfficialSessionState({ hasMounted: true, storage: withoutToken }),
    false,
  );
});
