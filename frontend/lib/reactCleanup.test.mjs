import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('animated counter cancels its animation frame on cleanup', async () => {
  const source = await readFile(new URL('../components/AnimatedCounter.tsx', import.meta.url), 'utf8');

  assert.match(source, /cancelAnimationFrame\(/);
  assert.match(source, /frameIdRef/);
});

test('credential copy feedback clears its timer on unmount', async () => {
  const source = await readFile(new URL('../components/CredentialCard.tsx', import.meta.url), 'utf8');

  assert.match(source, /clearTimeout\(/);
  assert.match(source, /copyTimerRef/);
});

test('bank verification clears staged progress timers', async () => {
  const source = await readFile(new URL('../pages/bank-verify.tsx', import.meta.url), 'utf8');

  assert.match(source, /clearStageTimeouts/);
  assert.match(source, /clearTimeout\(/);
});
