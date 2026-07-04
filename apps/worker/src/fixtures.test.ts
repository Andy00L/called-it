import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Fixture } from '@calledit/txline';
import { summarizeFixtures } from './fixtures.js';
import type { MatchState } from './state.js';

function makeFixture(fixtureId: number, startTimeMs: number): Fixture {
  return {
    Ts: 1,
    StartTime: startTimeMs,
    Competition: 'World Cup',
    CompetitionId: 3067,
    FixtureGroupId: 1,
    Participant1Id: 10,
    Participant1: 'Spain',
    Participant2Id: 20,
    Participant2: 'Austria',
    FixtureId: fixtureId,
    Participant1IsHome: true,
  };
}

function makeState(fixtureId: number): MatchState {
  return {
    fixtureId,
    phase: 'live',
    clockSeconds: 1200,
    clockRunning: true,
    statusId: 4,
    score: {
      Participant1: { Total: { Goals: 2, Corners: 3 } },
      Participant2: { Total: { Goals: 1 } },
    },
    events: [],
    matchResult: { p1: 0.6, draw: 0.3, p2: 0.1 },
    matchResultTs: 5,
    lastScoresTs: 5,
    lastOddsTs: 5,
    updatedAtMs: 999,
  };
}

test('merges fixture metadata with its live state', () => {
  const rows = summarizeFixtures([makeFixture(7, 1000)], [makeState(7)]);
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row?.participant1, 'Spain');
  assert.equal(row?.phase, 'live');
  assert.equal(row?.goalsP1, 2);
  assert.equal(row?.goalsP2, 1);
  assert.equal(row?.matchResult?.p1, 0.6);
});

test('a fixture without state stays in phase pre with zero goals', () => {
  const rows = summarizeFixtures([makeFixture(8, 2000)], []);
  assert.equal(rows[0]?.phase, 'pre');
  assert.equal(rows[0]?.goalsP1, 0);
  assert.equal(rows[0]?.updatedAtMs, 0);
});

test('a state outside the snapshot window still gets a row, sorted last', () => {
  const rows = summarizeFixtures([makeFixture(8, 2000)], [makeState(99)]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.fixtureId, 8);
  assert.equal(rows[1]?.fixtureId, 99);
  assert.equal(rows[1]?.participant1, 'Fixture 99');
  assert.equal(rows[1]?.startTimeMs, 0);
});

test('rows sort by kickoff time', () => {
  const rows = summarizeFixtures([makeFixture(2, 5000), makeFixture(1, 1000)], []);
  assert.deepEqual(
    rows.map((row) => row.fixtureId),
    [1, 2],
  );
});
