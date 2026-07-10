import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildMomentum,
  parsePossibleEvent,
  participantToTeam,
  possessionTypeToDanger,
} from './momentum.js';

test('possession types map to danger levels, unknown to null', () => {
  assert.equal(possessionTypeToDanger('SafePossession'), 'safe');
  assert.equal(possessionTypeToDanger('AttackPossession'), 'attack');
  assert.equal(possessionTypeToDanger('DangerPossession'), 'danger');
  assert.equal(possessionTypeToDanger('HighDangerPossession'), 'high_danger');
  assert.equal(possessionTypeToDanger(undefined), null);
});

test('participant numbers map to pitch teams', () => {
  assert.equal(participantToTeam(1), 'p1');
  assert.equal(participantToTeam(2), 'p2');
  assert.equal(participantToTeam(undefined), null);
  assert.equal(participantToTeam(0), null);
});

test('a possessing team in high danger pushes the ball toward the opponent goal', () => {
  const p1Attacking = buildMomentum({
    possessingTeam: 'p1',
    dangerLevel: 'high_danger',
    matchResult: null,
    pendingSignal: null,
    lastEvent: null,
  });
  // p1 attacks toward 1; high danger sits near p2's goal but not on the line.
  assert.ok(p1Attacking.ballAdvance > 0.9 && p1Attacking.ballAdvance <= 0.92);
  assert.equal(p1Attacking.intensity, 1);

  const p2Attacking = buildMomentum({
    possessingTeam: 'p2',
    dangerLevel: 'danger',
    matchResult: null,
    pendingSignal: null,
    lastEvent: null,
  });
  // p2 attacks toward 0.
  assert.ok(p2Attacking.ballAdvance < 0.2);
});

test('with no possession record the market tilt nudges the ball off center', () => {
  const p1Favored = buildMomentum({
    possessingTeam: null,
    dangerLevel: null,
    matchResult: { p1: 0.6, draw: 0.25, p2: 0.15 },
    pendingSignal: null,
    lastEvent: null,
  });
  // A p1 favorite tilts pressure toward p2's goal (advance above center), gently.
  assert.ok(p1Favored.ballAdvance > 0.5 && p1Favored.ballAdvance < 0.6);
  assert.equal(p1Favored.possessingTeam, null);

  const even = buildMomentum({
    possessingTeam: null,
    dangerLevel: null,
    matchResult: { p1: 0.33, draw: 0.34, p2: 0.33 },
    pendingSignal: null,
    lastEvent: null,
  });
  assert.ok(Math.abs(even.ballAdvance - 0.5) < 0.001);
});

test('with neither possession nor market the ball rests at midfield', () => {
  const idle = buildMomentum({
    possessingTeam: null,
    dangerLevel: null,
    matchResult: null,
    pendingSignal: null,
    lastEvent: null,
  });
  assert.equal(idle.ballAdvance, 0.5);
});

test('possible-event maps to a pending signal, most exciting first', () => {
  assert.deepEqual(parsePossibleEvent({ Corner: true, Goal: true }, 1), {
    kind: 'goal',
    team: 'p1',
  });
  assert.deepEqual(parsePossibleEvent({ Corner: true }, 2), { kind: 'corner', team: 'p2' });
  assert.deepEqual(parsePossibleEvent({ Penalty: true }, undefined), {
    kind: 'penalty',
    team: null,
  });
  assert.equal(parsePossibleEvent({ Corner: false }, 1), null);
  assert.equal(parsePossibleEvent(undefined, 1), null);
});
