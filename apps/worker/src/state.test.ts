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
import { buildLivePayloadForState } from './live-payload.js';
import { createLatencyTracker } from './latency.js';

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

test('possession, danger, pre-signal and last event feed the pressure pitch', () => {
  const store = createMatchStateStore();
  const fixtureId = 4242;
  // Kick off so the phase is live.
  applyScoresUpdate(
    store,
    { FixtureId: fixtureId, Ts: 1, Action: 'kickoff', Clock: { Running: true, Seconds: 60 } },
    1,
  );
  // A high-danger possession record for team 1.
  applyScoresUpdate(
    store,
    {
      FixtureId: fixtureId,
      Ts: 2,
      Participant: 1,
      PossessionType: 'HighDangerPossession',
      PossibleEvent: { Corner: true },
      Clock: { Running: true, Seconds: 70 },
    },
    2,
  );
  let state = getMatchState(store, fixtureId);
  assert.ok(state !== undefined);
  assert.equal(state.possessingTeam, 'p1');
  assert.equal(state.dangerLevel, 'high_danger');
  assert.deepEqual(state.pendingSignal, { kind: 'corner', team: 'p1' });
  assert.equal(state.lastEvent, null);

  // The corner lands: it becomes the last event and clears the shimmer.
  applyScoresUpdate(
    store,
    {
      FixtureId: fixtureId,
      Ts: 3,
      Action: 'corner',
      Confirmed: true,
      Participant: 1,
      Clock: { Running: true, Seconds: 75 },
    },
    3,
  );
  state = getMatchState(store, fixtureId);
  assert.ok(state !== undefined);
  assert.equal(state.pendingSignal, null);
  assert.equal(state.lastEvent?.kind, 'corner');
  assert.equal(state.lastEvent?.team, 'p1');
  assert.equal(state.lastEvent?.id, 1);
});

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

// Lineups shaped like the live 2026-07-12 capture (Argentina vs Switzerland),
// shrunk to two players per team; ids join the PlayerStats keys below.
const LINEUPS_UPDATE: ScoresUpdate = {
  FixtureId: 88,
  Ts: 100,
  Action: 'lineups',
  Participant1Id: 1489,
  Participant2Id: 3099,
  Lineups: [
    {
      normativeId: 1489,
      preferredName: 'Argentina',
      lineups: [
        {
          rosterNumber: '10',
          positionId: 37,
          starter: true,
          player: { normativeId: 46557, preferredName: 'Messi, Lionel' },
        },
        {
          rosterNumber: '22',
          positionId: 37,
          starter: false,
          player: { normativeId: 948167, preferredName: 'Martinez, Lautaro Javier' },
        },
      ],
    },
    {
      normativeId: 3099,
      preferredName: 'Switzerland',
      lineups: [
        {
          rosterNumber: '1',
          positionId: 34,
          starter: true,
          player: { normativeId: 418624, preferredName: 'Sommer, Yann' },
        },
      ],
    },
  ],
};

test('lineups, jersey, and PlayerStats records fill the squad state', () => {
  const store = createMatchStateStore();
  applyScoresUpdate(store, LINEUPS_UPDATE, 1);
  applyScoresUpdate(
    store,
    {
      FixtureId: 88,
      Ts: 110,
      Action: 'jersey',
      Participant: 2,
      Data: { Color: 'white' },
    },
    2,
  );
  applyScoresUpdate(
    store,
    {
      FixtureId: 88,
      Ts: 120,
      Action: 'goal',
      Confirmed: true,
      Participant: 1,
      Clock: { Running: true, Seconds: 1380 },
      Data: { PlayerId: 46557, GoalType: 'Shot' },
      PlayerStats: { Participant1: { '46557': { goals: 1 } } },
    },
    3,
  );

  const state = getMatchState(store, 88);
  assert.ok(state !== undefined);
  assert.equal(state.squadP1?.teamName, 'Argentina');
  assert.equal(state.squadP2?.teamName, 'Switzerland');
  assert.equal(state.squadP1?.players[0]?.name, 'Messi, Lionel');
  assert.equal(state.squadP1?.players[0]?.positionGroup, 'fwd');
  assert.equal(state.squadP2?.players[0]?.positionGroup, 'gk');
  assert.equal(state.jerseyColorP2, 'white');
  assert.equal(state.jerseyColorP1, null);
  assert.deepEqual(state.playerStats?.p1['46557'], { goals: 1, yellowCards: 0, redCards: 0 });
  assert.deepEqual(state.playerActions, [
    { kind: 'goal', playerId: 46557, team: 'p1', clockSeconds: 1380 },
  ]);

  // An older record cannot regress the cumulative PlayerStats snapshot.
  applyScoresUpdate(
    store,
    { FixtureId: 88, Ts: 60, Action: 'comment', PlayerStats: { Participant1: {} } },
    4,
  );
  assert.deepEqual(state.playerStats?.p1['46557'], { goals: 1, yellowCards: 0, redCards: 0 });
});

test('substitutions and red cards move players on and off the pitch', () => {
  const store = createMatchStateStore();
  applyScoresUpdate(store, LINEUPS_UPDATE, 1);
  const substitution: ScoresUpdate = {
    FixtureId: 88,
    Ts: 200,
    Id: 9001,
    Action: 'substitution',
    Confirmed: true,
    Clock: { Running: true, Seconds: 3660 },
    Data: { Participant: 1, PlayerInId: 948167, PlayerOutId: 46557 },
  };
  applyScoresUpdate(store, substitution, 2);
  // A re-sent record must not duplicate the timeline or flip state twice.
  applyScoresUpdate(store, substitution, 3);
  applyScoresUpdate(
    store,
    {
      FixtureId: 88,
      Ts: 300,
      Action: 'red_card',
      Confirmed: true,
      Participant: 2,
      Clock: { Running: true, Seconds: 4000 },
      Data: { PlayerId: 418624, Type: 'StraightRed' },
    },
    4,
  );

  const state = getMatchState(store, 88);
  assert.ok(state !== undefined);
  assert.deepEqual(
    state.playerActions.map((action) => action.kind),
    ['sub_off', 'sub_on', 'red_card'],
  );

  const payload = buildLivePayloadForState(state, createLatencyTracker(), createLatencyTracker());
  assert.ok(payload.squads !== null);
  const messi = payload.squads.p1?.players.find((player) => player.playerId === 46557);
  const lautaro = payload.squads.p1?.players.find((player) => player.playerId === 948167);
  const sommer = payload.squads.p2?.players.find((player) => player.playerId === 418624);
  assert.equal(messi?.onPitch, false);
  assert.equal(messi?.starter, true);
  assert.equal(lautaro?.onPitch, true);
  assert.equal(sommer?.onPitch, false);
  assert.equal(payload.squads.p2?.jerseyColor, null);
  assert.equal(payload.playerActions.length, 3);
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
