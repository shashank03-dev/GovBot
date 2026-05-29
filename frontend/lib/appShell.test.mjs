import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('app shell cancels the Lenis animation frame loop on cleanup', async () => {
  const source = await readFile(new URL('../pages/_app.tsx', import.meta.url), 'utf8');

  assert.match(source, /cancelAnimationFrame\(/);
  assert.match(source, /frameId/);
});

test('app shell loads Lenis only after hydration for motion-safe users', async () => {
  const source = await readFile(new URL('../pages/_app.tsx', import.meta.url), 'utf8');

  assert.doesNotMatch(source, /^import Lenis from ["']lenis["'];$/m);
  assert.match(source, /import\(["']lenis["']\)/);
  assert.match(source, /prefers-reduced-motion: reduce/);
});

test('document advertises intentional smooth scroll behavior to Next', async () => {
  const source = await readFile(new URL('../pages/_document.tsx', import.meta.url), 'utf8');

  assert.match(source, /data-scroll-behavior="smooth"/);
});
