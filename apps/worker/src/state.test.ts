import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { readStat } from '@calledit/engine';
import type { OddsPayload, ScoresUpdate } from '@calledit/txline';
import {
  applyOddsPayload,
  applyScoresUpdate,
  createMatchStateStore,
  getMatchState,
  isInRunning,
} from './state.js';

// Real captured payloads (USA vs Bosnia, devnet SL1, 2026-07-02). Reused from
// the engine package instead of duplicating a 40-record fixture here.
const fixtureUrl = new URL(
  '../../../packages/engine/src/__fixtures__/usa-bosnia-scores.json',
  import.meta.url,
);
const capturedUpdates = JSON.parse(readFileSync(fixtureUrl, 'utf8')) as ScoresUpdate[];

// StablePrice Pct values observed live for Spain vs Austria (docs/FEEDBACK.md).
const REAL_MATCH_RESULT_ODDS: OddsPayload = {
  FixtureId: 999,
  MessageId: 'test-1',
  Ts: 1751400000000,
  Bookmaker: 'StablePrice',
  BookmakerId: 0,
  SuperOddsType: '1X2_PARTICIPANT_RESULT',
  InRunning: true,
  PriceNames: ['Participant1', 'Draw', 'Participant2'],
  Prices: [179, 288, 1050],
  Pct: ['55.804', '34.710', '9.524'],
};

test('replaying the real scores capture rebuilds the final match state', () => {
  const store = createMatchStateStore();
  const orderedUpdates = [...capturedUpdates].sort(
    (earlier, later) => earlier.Ts - later.Ts,
  );
  for (const update of orderedUpdates) {
    applyScoresUpdate(store, update, Date.now());
  }

  const firstUpdate = orderedUpdates[0];
  assert.ok(firstUpdate !== undefined);
  const state = getMatchState(store, firstUpdate.FixtureId);
  assert.ok(state !== undefined);

  // Known final totals of the capture per the game_finalised record: 2 goals
  // (the second awarded after a VAR overturn), 7 corners, 2 cards.
  assert.equal(readStat(state.score, 'goals', 'either'), 2);
  assert.equal(readStat(state.score, 'corners', 'either'), 7);
  assert.equal(readStat(state.score, 'cards', 'either'), 2);
  // The feed zeroes the clock at full time (clock_adjustment action with
  // Seconds 0), so the final state's clock is 0 while timeline events keep
  // the live clocks they were stamped with.
  assert.equal(state.phase, 'finished');
  assert.equal(state.clockSeconds, 0);
  assert.ok(state.events.some((event) => event.kind === 'goal' && event.clockSeconds > 0));
  assert.ok(state.events.some((event) => event.kind === 'corner'));
});

test('duplicate scores records do not duplicate events', () => {
  const store = createMatchStateStore();
  const goalUpdate = capturedUpdates.find((update) => update.Action === 'goal');
  assert.ok(goalUpdate !== undefined);

  applyScoresUpdate(store, goalUpdate, 1);
  applyScoresUpdate(store, goalUpdate, 2);
  const state = getMatchState(store, goalUpdate.FixtureId);
  assert.ok(state !== undefined);
  assert.equal(state.events.length, 1);
});

test('an older Ts cannot regress the cumulative score', () => {
  const store = createMatchStateStore();
  const newer: ScoresUpdate = {
    FixtureId: 7,
    Ts: 2000,
    Action: 'corner',
    Confirmed: true,
    Clock: { Running: true, Seconds: 600 },
    Score: { Participant1: { Total: { Corners: 3 } } },
  };
  const older: ScoresUpdate = {
    FixtureId: 7,
    Ts: 1000,
    Action: 'corner',
    Confirmed: true,
    Clock: { Running: true, Seconds: 500 },
    Score: { Participant1: { Total: { Corners: 2 } } },
  };
  applyScoresUpdate(store, newer, 1);
  applyScoresUpdate(store, older, 2);
  const state = getMatchState(store, 7);
  assert.ok(state !== undefined);
  assert.equal(readStat(state.score, 'corners', 'p1'), 3);
  assert.equal(state.clockSeconds, 600);
});

test('phase moves pre -> live -> finished and gates call generation', () => {
  const store = createMatchStateStore();
  const scheduled: ScoresUpdate = { FixtureId: 5, Ts: 1 };
  applyScoresUpdate(store, scheduled, 1);
  const preState = getMatchState(store, 5);
  assert.ok(preState !== undefined);
  assert.equal(preState.phase, 'pre');
  assert.equal(isInRunning(preState), false);

  const kickoff: ScoresUpdate = {
    FixtureId: 5,
    Ts: 2,
    Action: 'kickoff',
    Clock: { Running: true, Seconds: 1 },
  };
  applyScoresUpdate(store, kickoff, 2);
  const liveState = getMatchState(store, 5);
  assert.ok(liveState !== undefined);
  assert.equal(liveState.phase, 'live');
  assert.equal(isInRunning(liveState), true);

  const finalised: ScoresUpdate = {
    FixtureId: 5,
    Ts: 3,
    Action: 'game_finalised',
    Clock: { Running: false, Seconds: 5400 },
  };
  applyScoresUpdate(store, finalised, 3);
  const finishedState = getMatchState(store, 5);
  assert.ok(finishedState !== undefined);
  assert.equal(finishedState.phase, 'finished');
  assert.equal(isInRunning(finishedState), false);
});

test('the 1X2 StablePrice record sets match-result probabilities', () => {
  const store = createMatchStateStore();
  applyOddsPayload(store, REAL_MATCH_RESULT_ODDS, 1);
  const state = getMatchState(store, 999);
  assert.ok(state !== undefined);
  assert.ok(state.matchResult !== null);
  assert.ok(Math.abs(state.matchResult.p1 - 0.55804) < 1e-9);
  assert.ok(Math.abs(state.matchResult.draw - 0.3471) < 1e-9);
  assert.ok(Math.abs(state.matchResult.p2 - 0.09524) < 1e-9);

  // An older 1X2 record must not overwrite a newer one.
  const staleOdds: OddsPayload = {
    ...REAL_MATCH_RESULT_ODDS,
    Ts: REAL_MATCH_RESULT_ODDS.Ts - 1000,
    Pct: ['50.000', '30.000', '20.000'],
  };
  applyOddsPayload(store, staleOdds, 2);
  const unchanged = getMatchState(store, 999);
  assert.ok(unchanged !== undefined && unchanged.matchResult !== null);
  assert.ok(Math.abs(unchanged.matchResult.p1 - 0.55804) < 1e-9);
});
