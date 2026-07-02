import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { ScoresUpdate } from '@calledit/txline';
import { resolveEventWindow, type EventWindowPredicate } from './calls.js';
import { extractEvents, latestClockSeconds, readStat } from './score.js';

/**
 * Integration test over real captured data (USA vs Bosnia, devnet SL1, 2026-07-02).
 * Proves the readers and extractors work against actual API payload shapes.
 * Final totals from the fixture: 1 goal, 7 corners, 2 cards combined.
 */
const fixtureUrl = new URL('./__fixtures__/usa-bosnia-scores.json', import.meta.url);
const updates = JSON.parse(readFileSync(fixtureUrl, 'utf8')) as ScoresUpdate[];

function finalScore(): ScoresUpdate['Score'] {
  for (let i = updates.length - 1; i >= 0; i -= 1) {
    const candidate = updates[i];
    if (candidate?.Score !== undefined) {
      return candidate.Score;
    }
  }
  return undefined;
}

test('cumulative stats match the known final score', () => {
  const score = finalScore();
  assert.equal(readStat(score, 'goals', 'either'), 1);
  assert.equal(readStat(score, 'corners', 'either'), 7);
  assert.equal(readStat(score, 'cards', 'either'), 2);
  assert.equal(readStat(score, 'corners', 'p1'), 4);
  assert.equal(readStat(score, 'corners', 'p2'), 3);
});

test('events extract from real payloads', () => {
  const events = extractEvents(updates);
  assert.ok(events.length > 0);
  assert.ok(events.some((event) => event.kind === 'goal'));
  assert.ok(events.some((event) => event.kind === 'corner'));
});

test('a full-match goal window resolves as a hit on real data', () => {
  const events = extractEvents(updates);
  const clock = latestClockSeconds(updates);
  const goalWindow: EventWindowPredicate = {
    kind: 'event_window',
    event: 'goal',
    team: 'either',
    fromClockSeconds: 0,
    toClockSeconds: clock + 1,
  };
  assert.equal(resolveEventWindow(goalWindow, events, clock), 'hit');
});
