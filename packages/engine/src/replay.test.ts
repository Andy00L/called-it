import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { ScoresUpdate } from '@calledit/txline';
import { resolveEventWindow, type EventWindowPredicate } from './calls.js';
import { extractEvents, latestClockSeconds, readStat } from './score.js';

/**
 * Integration test over real captured data (USA vs Bosnia, devnet SL1, 2026-07-02).
 * Proves the readers and extractors work against actual API payload shapes.
 * Final totals per the game_finalised record: 2 goals (the second awarded after
 * a VAR overturn at 78'), 7 corners, 2 cards combined.
 */
const fixtureUrl = new URL('./__fixtures__/usa-bosnia-scores.json', import.meta.url);
const updates = JSON.parse(readFileSync(fixtureUrl, 'utf8')) as ScoresUpdate[];

/**
 * The authoritative final state is the newest record carrying a Score (here
 * game_finalised). File order is not Ts order, and snapshot records of other
 * action types can carry stale Score copies (see docs/FEEDBACK.md finding 7).
 */
function finalScore(): ScoresUpdate['Score'] {
  let newest: ScoresUpdate | undefined;
  for (const update of updates) {
    if (update.Score === undefined) {
      continue;
    }
    if (newest === undefined || update.Ts > newest.Ts) {
      newest = update;
    }
  }
  return newest?.Score;
}

test('cumulative stats match the known final score', () => {
  const score = finalScore();
  assert.equal(readStat(score, 'goals', 'either'), 2);
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
