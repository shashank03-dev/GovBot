import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  buildCredentialByConfirmationApiPath,
  buildCredentialRecordApiPath,
  buildCredentialVerifyApiPath,
} from './credentialApi.mjs';

test('credential api helpers build explicit lookup routes for record and verification requests', () => {
  assert.equal(buildCredentialRecordApiPath('cred/123'), '/api/credentials/id/cred%2F123');
  assert.equal(
    buildCredentialByConfirmationApiPath('NSP 2026/ABC'),
    '/api/credentials/by-confirmation/NSP%202026%2FABC',
  );
  assert.equal(buildCredentialVerifyApiPath('cred 123'), '/api/credentials/verify/cred%20123');
});

test('verify page uses the explicit credential-id lookup helper instead of the wallet endpoint fallback', () => {
  const pageSource = readFileSync(new URL('../pages/verify/[id].tsx', import.meta.url), 'utf8');

  assert.match(pageSource, /buildCredentialRecordApiPath/);
  assert.doesNotMatch(pageSource, /fetch\(`\/api\/credentials\/\$\{credentialId\}`\)/);
});
