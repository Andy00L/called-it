import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { OddsPayload } from '@calledit/txline';
import { parseStablePct, readMatchResult } from './odds.js';

test('parseStablePct converts percentage strings to fractions', () => {
  assert.ok(Math.abs((parseStablePct('55.804') ?? 0) - 0.55804) < 1e-9);
  assert.equal(parseStablePct('NA'), null);
  assert.equal(parseStablePct(undefined), null);
  assert.equal(parseStablePct('junk'), null);
});

function matchResultRecord(ts: number, pct: string[]): OddsPayload {
  return {
    FixtureId: 18179551,
    MessageId: `m-${ts}`,
    Ts: ts,
    Bookmaker: 'consensus',
    BookmakerId: 0,
    SuperOddsType: '1X2_PARTICIPANT_RESULT',
    InRunning: true,
    PriceNames: ['part1', 'draw', 'part2'],
    Prices: [180, 350, 900],
    Pct: pct,
  };
}

test('readMatchResult extracts de-margined 1X2 probabilities', () => {
  const result = readMatchResult([matchResultRecord(100, ['55.804', '34.710', '9.524'])]);
  assert.notEqual(result, null);
  assert.ok(Math.abs((result?.p1 ?? 0) - 0.55804) < 1e-9);
  assert.ok(Math.abs((result?.draw ?? 0) - 0.3471) < 1e-9);
  assert.ok(Math.abs((result?.p2 ?? 0) - 0.09524) < 1e-9);
});

test('readMatchResult prefers the most recent record', () => {
  const result = readMatchResult([
    matchResultRecord(100, ['55.804', '34.710', '9.524']),
    matchResultRecord(200, ['50.000', '30.000', '20.000']),
  ]);
  assert.ok(Math.abs((result?.p1 ?? 0) - 0.5) < 1e-9);
  assert.ok(Math.abs((result?.p2 ?? 0) - 0.2) < 1e-9);
});

test('readMatchResult returns null when the market is absent', () => {
  const other: OddsPayload = { ...matchResultRecord(100, ['1', '1', '1']), SuperOddsType: 'OVERUNDER_PARTICIPANT_GOALS' };
  assert.equal(readMatchResult([other]), null);
  assert.equal(readMatchResult([]), null);
});
