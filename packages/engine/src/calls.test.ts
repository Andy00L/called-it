import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type EventWindowPredicate,
  type MatchEvent,
  type ProbHoldPredicate,
  findNearMissEvent,
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

test('near miss finds the earliest matching event just past the window', () => {
  const events = [corner(650, 2), corner(780, 1), corner(950, 1)];
  const found = findNearMissEvent(cornerWindow, events, 300);
  assert.equal(found?.clockSeconds, 650);
});

test('near miss ignores in-window, unconfirmed, wrong-team, and beyond-horizon events', () => {
  assert.equal(findNearMissEvent(cornerWindow, [corner(500)], 300), null);
  assert.equal(findNearMissEvent(cornerWindow, [corner(650, 1, false)], 300), null);
  const p2Window: EventWindowPredicate = { ...cornerWindow, team: 'p2' };
  assert.equal(findNearMissEvent(p2Window, [corner(650, 1)], 300), null);
  assert.equal(findNearMissEvent(cornerWindow, [corner(901)], 300), null);
  assert.equal(findNearMissEvent(cornerWindow, [corner(900)], 300)?.clockSeconds, 900);
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
