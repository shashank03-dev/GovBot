import test from 'node:test';
import assert from 'node:assert/strict';

async function loadLayoutAuth() {
  const layoutAuth = await import('./layoutAuth.mjs').catch(() => null);
  assert.ok(layoutAuth?.resolveLoggedInState, 'expected layout auth helper to be defined');
  return layoutAuth;
}

test('resolveLoggedInState stays logged out until the client has mounted', async () => {
  const { resolveLoggedInState } = await loadLayoutAuth();

  assert.equal(
    resolveLoggedInState({
      hasMounted: false,
      storage: { getItem: () => 'existing-token' },
    }),
    false,
  );
});

test('resolveLoggedInState returns true after mount when a token exists', async () => {
  const { resolveLoggedInState } = await loadLayoutAuth();

  assert.equal(
    resolveLoggedInState({
      hasMounted: true,
      storage: { getItem: () => 'existing-token' },
    }),
    true,
  );
});

test('resolveProtectedRouteRedirect sends logged-out users to login with the requested path', async () => {
  const { resolveProtectedRouteRedirect } = await loadLayoutAuth();

  assert.equal(
    resolveProtectedRouteRedirect({
      hasMounted: true,
      storage: { getItem: () => '' },
      nextPath: '/renewals',
      requiredKeys: ['govbot_token', 'govbot_phone'],
    }),
    '/login?next=%2Frenewals',
  );
});
