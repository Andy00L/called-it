import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type EventWindowPredicate,
  type MatchEvent,
  type ProbHoldPredicate,
  resolveEventWindow,
  resolveProbHold,
} from './calls.js';

function corner(clockSeconds: number, participant = 1, confirmed = true): MatchEvent {
  return { action: 'corner', kind: 'corner', participant, clockSeconds, confirmed, ts: clockSeconds * 1000 };
}

const cornerWindow: EventWindowPredicate = {
  kind: 'event_window',
  event: 'corner',
  team: 'either',
  fromClockSeconds: 0,
  toClockSeconds: 600,
};

test('event window hits on a confirmed event inside the window', () => {
  assert.equal(resolveEventWindow(cornerWindow, [corner(300)], 300), 'hit');
});

test('event window ignores unconfirmed events', () => {
  assert.equal(resolveEventWindow(cornerWindow, [corner(300, 1, false)], 700), 'miss');
});

test('event window is pending until the window closes', () => {
  assert.equal(resolveEventWindow(cornerWindow, [], 300), 'pending');
  assert.equal(resolveEventWindow(cornerWindow, [], 700), 'miss');
});

test('event window respects the team selector', () => {
  const p2Window: EventWindowPredicate = { ...cornerWindow, team: 'p2' };
  assert.equal(resolveEventWindow(p2Window, [corner(300, 1)], 300), 'pending');
  assert.equal(resolveEventWindow(p2Window, [corner(300, 1)], 700), 'miss');
  assert.equal(resolveEventWindow(p2Window, [corner(300, 2)], 300), 'hit');
});

test('an event outside the window does not count', () => {
  assert.equal(resolveEventWindow(cornerWindow, [corner(900)], 900), 'miss');
});

test('card window matches yellow or red cards', () => {
  const cardWindow: EventWindowPredicate = {
    kind: 'event_window',
    event: 'card',
    team: 'either',
    fromClockSeconds: 0,
    toClockSeconds: 900,
  };
  const yellow: MatchEvent = {
    action: 'yellow_card',
    kind: 'card',
    participant: 2,
    clockSeconds: 500,
    confirmed: true,
    ts: 500,
  };
  const red: MatchEvent = {
    action: 'red_card',
    kind: 'card',
    participant: 1,
    clockSeconds: 800,
    confirmed: true,
    ts: 800,
  };
  assert.equal(resolveEventWindow(cardWindow, [yellow], 500), 'hit');
  assert.equal(resolveEventWindow(cardWindow, [red], 800), 'hit');
});

const holdPredicate: ProbHoldPredicate = {
  kind: 'prob_hold',
  team: 'p2',
  minProbabilityFraction: 0.15,
  atClockSeconds: 4800,
};

test('prob hold is pending before the target clock', () => {
  assert.equal(resolveProbHold(holdPredicate, 0.2, 4000), 'pending');
});

test('prob hold is pending without an observed probability', () => {
  assert.equal(resolveProbHold(holdPredicate, undefined, 5000), 'pending');
});

test('prob hold resolves at or above threshold', () => {
  assert.equal(resolveProbHold(holdPredicate, 0.2, 5000), 'hit');
  assert.equal(resolveProbHold(holdPredicate, 0.15, 5000), 'hit');
  assert.equal(resolveProbHold(holdPredicate, 0.1, 5000), 'miss');
});
