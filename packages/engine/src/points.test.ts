import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  awardPoints,
  MAX_POINTS,
  MIN_POINTS,
  nextStreak,
  pointsForProbability,
  streakMultiplier,
} from './points.js';

test('points scale inversely with probability', () => {
  assert.equal(pointsForProbability(0.12), 833);
  assert.equal(pointsForProbability(0.85), 118);
  assert.equal(pointsForProbability(0.5), 200);
});

test('points are capped and floored', () => {
  assert.equal(pointsForProbability(0.05), MAX_POINTS);
  assert.equal(pointsForProbability(0.001), MAX_POINTS);
  assert.equal(pointsForProbability(1), MIN_POINTS);
  assert.equal(pointsForProbability(1.5), MIN_POINTS);
});

test('degenerate probabilities do not crash', () => {
  assert.equal(pointsForProbability(0), MAX_POINTS);
  assert.equal(pointsForProbability(-0.2), MAX_POINTS);
  assert.equal(pointsForProbability(Number.NaN), MAX_POINTS);
});

test('streak multiplier compounds and caps', () => {
  assert.equal(streakMultiplier(0), 1);
  assert.ok(Math.abs(streakMultiplier(1) - 1.1) < 1e-9);
  assert.ok(Math.abs(streakMultiplier(2) - 1.21) < 1e-9);
  assert.equal(streakMultiplier(100), 3);
});

test('awarded points fold in the streak', () => {
  assert.equal(awardPoints(0.5, 0), 200);
  assert.equal(awardPoints(0.5, 1), 220);
});

test('streak transitions', () => {
  assert.equal(nextStreak(2, 'hit'), 3);
  assert.equal(nextStreak(0, 'hit'), 1);
  assert.equal(nextStreak(5, 'miss'), 0);
});
