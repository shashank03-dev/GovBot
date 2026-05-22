import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeRealtimeActivity } from './dashboardRealtime.mjs';

test('mergeRealtimeActivity appends new event in chronological order', () => {
  const merged = mergeRealtimeActivity(
    [
      { event: 'Profile collection started', timestamp: '2026-05-21T12:00:00Z' },
      { event: 'Income recorded: Rs24000', timestamp: '2026-05-21T12:02:00Z' },
    ],
    { event: 'Application submitted', timestamp: '2026-05-21T12:05:00Z' },
  );

  assert.deepEqual(merged, [
    { event: 'Profile collection started', timestamp: '2026-05-21T12:00:00Z' },
    { event: 'Income recorded: Rs24000', timestamp: '2026-05-21T12:02:00Z' },
    { event: 'Application submitted', timestamp: '2026-05-21T12:05:00Z' },
  ]);
});

test('mergeRealtimeActivity ignores duplicate activity rows', () => {
  const merged = mergeRealtimeActivity(
    [{ event: 'Security passkey set', timestamp: '2026-05-21T12:05:00Z' }],
    { event: 'Security passkey set', timestamp: '2026-05-21T12:05:00Z' },
  );

  assert.deepEqual(merged, [
    { event: 'Security passkey set', timestamp: '2026-05-21T12:05:00Z' },
  ]);
});

test('mergeRealtimeActivity keeps only the latest twenty events', () => {
  const existing = Array.from({ length: 20 }, (_, index) => ({
    event: `Event ${index + 1}`,
    timestamp: `2026-05-21T12:${String(index).padStart(2, '0')}:00Z`,
  }));

  const merged = mergeRealtimeActivity(existing, {
    event: 'Newest event',
    timestamp: '2026-05-21T12:20:00Z',
  });

  assert.equal(merged.length, 20);
  assert.equal(merged[0].event, 'Event 2');
  assert.equal(merged.at(-1)?.event, 'Newest event');
});
