import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDashboardLoginHref,
  resolveProtectedHref,
  buildTrackHref,
  sanitizePostLoginPath,
  TRACK_SEARCH_HREF,
} from './navigationLinks.mjs';

test('dashboard login href preserves a safe next path', () => {
  assert.equal(buildDashboardLoginHref(), '/login?next=%2Fdashboard');
  assert.equal(buildDashboardLoginHref('/track/NSP2026ABC123'), '/login?next=%2Ftrack%2FNSP2026ABC123');
  assert.equal(
    buildDashboardLoginHref('/documents?document=doc-pan-1'),
    '/login?next=%2Fdocuments%3Fdocument%3Ddoc-pan-1',
  );
});

test('dashboard login href drops unsafe next paths', () => {
  assert.equal(buildDashboardLoginHref('https://evil.example/steal'), '/login?next=%2Fdashboard');
  assert.equal(buildDashboardLoginHref('//evil.example/steal'), '/login?next=%2Fdashboard');
});

test('protected hrefs send logged-out users through login and keep logged-in users on the target path', () => {
  assert.equal(
    resolveProtectedHref('/renewals', { isLoggedIn: false, requiresAuth: true }),
    '/login?next=%2Frenewals',
  );
  assert.equal(
    resolveProtectedHref('/renewals', { isLoggedIn: true, requiresAuth: true }),
    '/renewals',
  );
  assert.equal(
    resolveProtectedHref('/services', { isLoggedIn: false, requiresAuth: false }),
    '/services',
  );
});

test('track links encode confirmation numbers and search path is stable', () => {
  assert.equal(buildTrackHref('NSP 2026/ABC'), '/track/NSP%202026%2FABC');
  assert.equal(TRACK_SEARCH_HREF, '/track-search');
  assert.equal(sanitizePostLoginPath('/dashboard'), '/dashboard');
  assert.equal(sanitizePostLoginPath('/documents?document=doc-pan-1'), '/documents?document=doc-pan-1');
});
