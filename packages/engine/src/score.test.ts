import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ScoresUpdate, SoccerFixtureScore } from '@calledit/txline';
import { extractEvent, readStat } from './score.js';

const score: SoccerFixtureScore = {
  Participant1: {
    Total: { Goals: 2, Corners: 5, YellowCards: 1, RedCards: 1 },
    H1: { Goals: 1, Corners: 3 },
  },
  Participant2: {
    Total: { Goals: 1, Corners: 2, YellowCards: 2 },
  },
};

test('readStat sums by team and period', () => {
  assert.equal(readStat(score, 'goals', 'either'), 3);
  assert.equal(readStat(score, 'goals', 'p1'), 2);
  assert.equal(readStat(score, 'corners', 'either'), 7);
  assert.equal(readStat(score, 'cards', 'p1'), 2);
  assert.equal(readStat(score, 'cards', 'either'), 4);
  assert.equal(readStat(score, 'goals', 'p1', 'H1'), 1);
  assert.equal(readStat(undefined, 'goals', 'either'), 0);
});

test('extractEvent normalizes a scores update', () => {
  const update: ScoresUpdate = {
    FixtureId: 1,
    Ts: 1000,
    Action: 'goal',
    Participant: 1,
    Confirmed: true,
    Clock: { Running: true, Seconds: 300 },
  };
  const event = extractEvent(update);
  assert.notEqual(event, null);
  assert.equal(event?.kind, 'goal');
  assert.equal(event?.clockSeconds, 300);
  assert.equal(event?.confirmed, true);
  assert.equal(event?.participant, 1);
});

test('extractEvent tags unknown actions as other', () => {
  const update: ScoresUpdate = {
    FixtureId: 1,
    Ts: 1,
    Action: 'throw_in',
    Clock: { Running: true, Seconds: 10 },
  };
  assert.equal(extractEvent(update)?.kind, 'other');
});

test('extractEvent returns null without action or clock', () => {
  assert.equal(extractEvent({ FixtureId: 1, Ts: 1, Clock: { Running: true, Seconds: 1 } }), null);
  assert.equal(extractEvent({ FixtureId: 1, Ts: 1, Action: 'goal' }), null);
});
