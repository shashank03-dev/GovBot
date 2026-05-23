import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LOCAL_BACKEND_FALLBACK,
  buildApplicationTimelineApiPath,
  buildProxyApiPath,
  resolveBackendBaseUrl,
} from './backendApi.mjs';

test('buildProxyApiPath keeps browser calls on the same origin', () => {
  assert.equal(buildProxyApiPath('applications/NSP2026ABC/timeline'), '/api/applications/NSP2026ABC/timeline');
  assert.equal(buildProxyApiPath('/profile/919632363213'), '/api/profile/919632363213');
  assert.equal(buildApplicationTimelineApiPath('NSP 2026/ABC'), '/api/applications/NSP%202026%2FABC/timeline');
});

test('resolveBackendBaseUrl prefers configured server URLs before localhost fallback', () => {
  assert.equal(resolveBackendBaseUrl({ BACKEND_URL: 'https://backend.example/' }), 'https://backend.example');
  assert.equal(resolveBackendBaseUrl({ API_URL: 'https://api.example/' }), 'https://api.example');
  assert.equal(resolveBackendBaseUrl({ NEXT_PUBLIC_API_URL: 'https://public-api.example/' }), 'https://public-api.example');
  assert.equal(resolveBackendBaseUrl({ NEXT_PUBLIC_RAILWAY_URL: 'https://railway.example/' }), 'https://railway.example');
  assert.equal(resolveBackendBaseUrl({}), LOCAL_BACKEND_FALLBACK);
});
