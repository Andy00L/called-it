import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateCalls, probabilityWithin } from './catalog.js';
import { pointsForProbability } from './points.js';

test('probabilityWithin follows the Poisson model', () => {
  assert.equal(probabilityWithin(0.11, 0), 0);
  assert.ok(Math.abs(probabilityWithin(0.11, 10) - (1 - Math.exp(-1.1))) < 1e-9);
});

test('no calls when the match is not running', () => {
  const calls = generateCalls({
    clockSeconds: 600,
    score: undefined,
    matchResult: null,
    inRunning: false,
  });
  assert.equal(calls.length, 0);
});

test('first-half state offers goal-before-half-time and micro windows', () => {
  const calls = generateCalls({
    clockSeconds: 600,
    score: undefined,
    matchResult: { p1: 0.2, draw: 0.3, p2: 0.5 },
    inRunning: true,
  });
  const labels = calls.map((call) => call.label);
  assert.ok(labels.includes('Corner in the next 10 minutes'));
  assert.ok(labels.includes('A card in the next 15 minutes'));
  assert.ok(labels.includes('Goal before half-time'));

  for (const call of calls) {
    assert.equal(call.potentialPoints, pointsForProbability(call.probabilityFraction));
    assert.ok(call.probabilityFraction > 0 && call.probabilityFraction <= 1);
  }
});

test('probability-hold call prices the underdog by the live market', () => {
  const calls = generateCalls({
    clockSeconds: 600,
    score: undefined,
    matchResult: { p1: 0.2, draw: 0.3, p2: 0.5 },
    inRunning: true,
  });
  const hold = calls.find((call) => call.category === 'probability');
  assert.notEqual(hold, undefined);
  assert.equal(hold?.pricingSource, 'market');
  assert.equal(hold?.probabilityFraction, 0.2);
  assert.equal(hold?.predicate.kind, 'prob_hold');
});

test('second-half state switches the goal window label', () => {
  const calls = generateCalls({
    clockSeconds: 3000,
    score: undefined,
    matchResult: null,
    inRunning: true,
  });
  const labels = calls.map((call) => call.label);
  assert.ok(labels.includes('Goal in the next 15 minutes'));
  assert.ok(!labels.includes('Goal before half-time'));
});
