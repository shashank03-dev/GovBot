import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HOMEPAGE_DISCOVER_CARDS,
  HOMEPAGE_FEATURES,
  HERO_CONSOLE_STEPS,
  HERO_CHAT_MESSAGES,
  HERO_PRODUCT_POSITIONING,
  HERO_SERVICE_PILLS,
  LOGIN_HIGHLIGHTS,
  ONBOARDING_ACTIVITY_ITEMS,
  ONBOARDING_SIGNALS,
  SERVICE_CARDS,
  TOOL_CARDS,
} from './siteFeatureContent.mjs';

function ids(items) {
  return new Set(items.map((item) => item.id));
}

test('homepage surfaces the missing core repo capabilities', () => {
  const featureIds = ids(HOMEPAGE_FEATURES);
  const discoverIds = ids(HOMEPAGE_DISCOVER_CARDS);

  for (const expected of [
    'whatsapp-entry',
    'citizen-profile',
    'document-vault',
    'digilocker-ocr',
    'live-tracking',
    'credential-verification',
  ]) {
    assert.equal(featureIds.has(expected), true, `homepage feature missing: ${expected}`);
  }

  for (const expected of [
    'track-application',
    'pm-kisan',
    'digilocker-sync',
    'official-analytics',
  ]) {
    assert.equal(discoverIds.has(expected), true, `homepage discover card missing: ${expected}`);
  }
});

test('services hub lists product entry points beyond scholarship apply', () => {
  const mainIds = ids(SERVICE_CARDS);
  const toolIds = ids(TOOL_CARDS);

  for (const expected of [
    'track-application',
    'pm-kisan',
    'citizen-profile',
    'whatsapp-login',
  ]) {
    assert.equal(mainIds.has(expected), true, `service card missing: ${expected}`);
  }

  for (const expected of [
    'document-vault',
    'digilocker-sync',
    'credential-verification',
    'live-dashboard',
  ]) {
    assert.equal(toolIds.has(expected), true, `tool card missing: ${expected}`);
  }
});

test('login highlights surface QR and WhatsApp handoff', () => {
  const highlightIds = ids(LOGIN_HIGHLIGHTS);

  for (const expected of ['whatsapp-otp', 'qr-handoff', 'dashboard-access']) {
    assert.equal(highlightIds.has(expected), true, `login highlight missing: ${expected}`);
  }
});

test('landing motion content supports chat and onboarding workflow cues', () => {
  const chatIds = ids(HERO_CHAT_MESSAGES);
  const signalIds = ids(ONBOARDING_SIGNALS);

  for (const expected of ['citizen-whatsapp', 'govbot-eligibility', 'vault-passkey', 'live-tracker']) {
    assert.equal(chatIds.has(expected), true, `hero chat cue missing: ${expected}`);
  }

  for (const expected of ['chat-intake', 'profile-ready', 'vault-locked', 'timeline-live']) {
    assert.equal(signalIds.has(expected), true, `onboarding signal missing: ${expected}`);
  }
});

test('hero positions GovBot as a broader citizen services product', () => {
  assert.match(HERO_PRODUCT_POSITIONING.kicker, /citizen services/i);
  assert.match(HERO_PRODUCT_POSITIONING.title, /citizen services/i);
  assert.match(HERO_PRODUCT_POSITIONING.description, /profile|documents|tracking|verification/i);
  assert.doesNotMatch(HERO_PRODUCT_POSITIONING.title, /scholarship journey/i);
});

test('hero and onboarding include richer product demonstration elements', () => {
  const serviceIds = ids(HERO_SERVICE_PILLS);
  const consoleIds = ids(HERO_CONSOLE_STEPS);
  const activityIds = ids(ONBOARDING_ACTIVITY_ITEMS);

  for (const expected of ['benefits', 'documents', 'verification', 'official-review']) {
    assert.equal(serviceIds.has(expected), true, `hero service pill missing: ${expected}`);
  }

  for (const expected of ['match-service', 'reuse-profile', 'secure-submit', 'share-proof']) {
    assert.equal(consoleIds.has(expected), true, `hero console step missing: ${expected}`);
  }

  for (const expected of ['phone-verified', 'profile-attached', 'vault-unlocked', 'official-sync']) {
    assert.equal(activityIds.has(expected), true, `onboarding activity missing: ${expected}`);
  }
});
