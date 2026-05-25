import test from 'node:test';
import assert from 'node:assert/strict';

import { getSSPContent } from './sspContent.mjs';

test('getSSPContent returns english by default and kannada variant when requested', () => {
  const english = getSSPContent();
  const kannada = getSSPContent('kn');

  assert.equal(english.language, 'en');
  assert.equal(kannada.language, 'kn');
  assert.equal(english.defaultLanguage, 'en');
  assert.equal(english.portalRoute, '/ssp');
  assert.equal(english.dashboard.steps.length, 5);
});
