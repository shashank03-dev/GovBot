import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

import {
  LOCAL_BACKEND_FALLBACK,
  NGROK_SKIP_BROWSER_WARNING_HEADER,
  buildApplicationTimelineApiPath,
  buildBackendRequestInit,
  buildBackendUrl,
  buildProxyApiPath,
  resolveBackendBaseUrl,
  shouldUseNgrokBypassHeader,
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
