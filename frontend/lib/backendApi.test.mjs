import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import {
  LOCAL_BACKEND_FALLBACK,
  NGROK_SKIP_BROWSER_WARNING_HEADER,
  buildApplicationTimelineApiPath,
  buildBackendRequestInit,
  buildBackendUrl,
  buildBackendProxyUrl,
  buildProxyApiPath,
  resolveBackendProxyPath,
  resolveBackendBaseUrl,
  shouldUseNgrokBypassHeader,
} from './backendApi.mjs';

test('buildProxyApiPath keeps browser calls on the same origin', () => {
  assert.equal(buildProxyApiPath('applications/NSP2026ABC/timeline'), '/api/applications/NSP2026ABC/timeline');
  assert.equal(buildProxyApiPath('/profile/919632363213'), '/api/profile/919632363213');
  assert.equal(buildApplicationTimelineApiPath('NSP 2026/ABC'), '/api/applications/NSP%202026%2FABC/timeline');
});

test('resolveBackendProxyPath maps frontend api paths to backend targets', () => {
  assert.equal(resolveBackendProxyPath('send-otp'), '/auth/send-otp');
  assert.equal(resolveBackendProxyPath('verify-otp'), '/auth/verify-otp');
  assert.equal(resolveBackendProxyPath('auth/official/login'), '/auth/official/login');
  assert.equal(resolveBackendProxyPath('pm-kisan'), '/pm-kisan/status');
  assert.equal(resolveBackendProxyPath('profile/919632363213'), '/profile/919632363213');
  assert.equal(resolveBackendProxyPath('renewals/reminders/919632363213'), '/renewals/reminders/919632363213');
  assert.equal(resolveBackendProxyPath('portals'), '/portals');
  assert.equal(resolveBackendProxyPath('portals/nsp/apply'), '/portals/nsp/apply');
  assert.equal(resolveBackendProxyPath('bank/ready'), '/api/bank/ready');
  assert.equal(resolveBackendProxyPath('digilocker/review/demo'), '/api/digilocker/review/demo');
  assert.equal(resolveBackendProxyPath('ssp/draft/919632363213'), '/api/ssp/draft/919632363213');
  assert.equal(resolveBackendProxyPath('hello'), null);
});

test('bank ready api relay exists and targets the backend ready endpoint', () => {
  const routeSource = readFileSync(new URL('../pages/api/bank/ready.ts', import.meta.url), 'utf8');

  assert.match(routeSource, /buildBackendUrl\('\/api\/bank\/mock\/ready'\)/);
  assert.match(routeSource, /return res\.status\(405\)\.json\(\{ error: 'Method not allowed' \}\)/);
});

test('buildBackendProxyUrl joins mapped api paths onto the backend base url', () => {
  const env = { NEXT_PUBLIC_API_URL: 'https://sun-nonlicentious-buzzingly.ngrok-free.dev/' };

  assert.equal(
    buildBackendProxyUrl('portals', env),
    'https://sun-nonlicentious-buzzingly.ngrok-free.dev/portals',
  );
  assert.equal(
    buildBackendProxyUrl('/bank/ready', env),
    'https://sun-nonlicentious-buzzingly.ngrok-free.dev/api/bank/ready',
  );
  assert.equal(buildBackendProxyUrl('hello', env), null);
});

test('form-fill screenshot helper keeps screenshot previews on the same origin', async () => {
  const backendApi = await import('./backendApi.mjs');

  assert.equal(typeof backendApi.buildFormScannerScreenshotApiPath, 'function');
  assert.equal(
    backendApi.buildFormScannerScreenshotApiPath('session-123/final.png'),
    '/api/form-scanner/screenshot/session-123/final.png',
  );
  assert.equal(
    backendApi.buildFormScannerScreenshotApiPath('/session-456/final.png'),
    '/api/form-scanner/screenshot/session-456/final.png',
  );
});

test('resolveBackendBaseUrl prefers configured server URLs before localhost fallback', () => {
  assert.equal(resolveBackendBaseUrl({ BACKEND_URL: 'https://backend.example/' }), 'https://backend.example');
  assert.equal(resolveBackendBaseUrl({ API_URL: 'https://api.example/' }), 'https://api.example');
  assert.equal(resolveBackendBaseUrl({ NEXT_PUBLIC_API_URL: 'https://public-api.example/' }), 'https://public-api.example');
  assert.equal(resolveBackendBaseUrl({ NEXT_PUBLIC_RAILWAY_URL: 'https://railway.example/' }), 'https://railway.example');
  assert.equal(resolveBackendBaseUrl({}), LOCAL_BACKEND_FALLBACK);
});

test('ngrok detection recognizes ngrok-backed deployments that need the browser warning bypass', () => {
  assert.equal(shouldUseNgrokBypassHeader({ NEXT_PUBLIC_API_URL: 'https://sun-nonlicentious-buzzingly.ngrok-free.dev/' }), true);
  assert.equal(shouldUseNgrokBypassHeader({ NEXT_PUBLIC_API_URL: 'https://demo.ngrok.app/' }), true);
  assert.equal(shouldUseNgrokBypassHeader({ NEXT_PUBLIC_API_URL: 'https://backend.example/' }), false);
});

test('buildBackendRequestInit adds the ngrok bypass header without dropping existing headers', () => {
  const init = buildBackendRequestInit(
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer token',
        'Content-Type': 'application/json',
      },
      body: '{"ok":true}',
    },
    { NEXT_PUBLIC_API_URL: 'https://sun-nonlicentious-buzzingly.ngrok-free.dev/' },
  );

  assert.equal(init.method, 'POST');
  assert.equal(init.body, '{"ok":true}');
  assert.deepEqual(init.headers, {
    authorization: 'Bearer token',
    'content-type': 'application/json',
    [NGROK_SKIP_BROWSER_WARNING_HEADER]: 'true',
  });
});

test('buildBackendRequestInit leaves non-ngrok requests unchanged', () => {
  const init = buildBackendRequestInit(
    {
      headers: {
        Authorization: 'Bearer token',
      },
    },
    { NEXT_PUBLIC_API_URL: 'https://backend.example/' },
  );

  assert.deepEqual(init.headers, {
    authorization: 'Bearer token',
  });
});

test('buildBackendUrl joins normalized paths onto the resolved backend URL', () => {
  const env = { NEXT_PUBLIC_API_URL: 'https://sun-nonlicentious-buzzingly.ngrok-free.dev/' };
  assert.equal(buildBackendUrl('/live/demo', env), 'https://sun-nonlicentious-buzzingly.ngrok-free.dev/live/demo');
  assert.equal(buildBackendUrl('auth/send-otp', env), 'https://sun-nonlicentious-buzzingly.ngrok-free.dev/auth/send-otp');
});

test('default helper detects bundled NEXT_PUBLIC_API_URL in browser-like builds', () => {
  const moduleUrl = new URL('./backendApi.mjs', import.meta.url).href;
  const output = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { shouldUseNgrokBypassHeader } from ${JSON.stringify(moduleUrl)}; console.log(shouldUseNgrokBypassHeader());`,
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NEXT_PUBLIC_API_URL: 'https://sun-nonlicentious-buzzingly.ngrok-free.dev',
      },
      encoding: 'utf8',
    },
  ).trim();

  assert.equal(output, 'true');
});

test('resolveBackendBaseUrl falls back to bundled public backend URLs when runtime env is empty', () => {
  const moduleUrl = new URL('./backendApi.mjs', import.meta.url).href;
  const output = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { resolveBackendBaseUrl } from ${JSON.stringify(moduleUrl)}; console.log(resolveBackendBaseUrl({}));`,
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NEXT_PUBLIC_API_URL: 'https://sun-nonlicentious-buzzingly.ngrok-free.dev',
      },
      encoding: 'utf8',
    },
  ).trim();

  assert.equal(output, 'https://sun-nonlicentious-buzzingly.ngrok-free.dev');
});
