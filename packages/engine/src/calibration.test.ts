import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calibrationBuckets, edgeVsMarket, marketBrierScore } from './calibration.js';
import type { SettledPick } from './points.js';

function settled(probabilityFraction: number, outcome: 'hit' | 'miss'): SettledPick {
  return { probabilityFraction, outcome, pointsAwarded: outcome === 'hit' ? 100 : 0 };
}

test('edgeVsMarket is null on an empty slate', () => {
  assert.equal(edgeVsMarket([]), null);
});

test('edgeVsMarket is zero when outcomes match the market pricing', () => {
  const picks = [settled(0.5, 'hit'), settled(0.5, 'miss')];
  assert.equal(edgeVsMarket(picks), 0);
});

test('edgeVsMarket is positive when low-probability calls keep hitting', () => {
  const picks = [settled(0.2, 'hit'), settled(0.2, 'hit')];
  const edge = edgeVsMarket(picks);
  assert.ok(edge !== null);
  assert.ok(Math.abs(edge - 0.8) < 1e-12);
});

test('marketBrierScore matches known values', () => {
  assert.equal(marketBrierScore([]), null);
  assert.equal(marketBrierScore([settled(1, 'hit')]), 0);
  const mixed = marketBrierScore([settled(0.5, 'hit'), settled(0.5, 'miss')]);
  assert.ok(mixed !== null);
  assert.ok(Math.abs(mixed - 0.25) < 1e-12);
});

test('calibrationBuckets partitions picks into bands with hit rates', () => {
  const picks = [settled(0.1, 'hit'), settled(0.9, 'miss'), settled(1, 'hit')];
  const buckets = calibrationBuckets(picks, 2);
  assert.equal(buckets.length, 2);

  const lowBand = buckets[0];
  const highBand = buckets[1];
  assert.ok(lowBand !== undefined && highBand !== undefined);

  assert.equal(lowBand.lowerBoundFraction, 0);
  assert.equal(lowBand.upperBoundFraction, 0.5);
  assert.equal(lowBand.pickCount, 1);
  assert.equal(lowBand.hitCount, 1);
  assert.equal(lowBand.hitRateFraction, 1);

  assert.equal(highBand.pickCount, 2);
  assert.equal(highBand.hitCount, 1);
  assert.equal(highBand.hitRateFraction, 0.5);
  assert.ok(highBand.averageProbabilityFraction !== null);
  assert.ok(Math.abs(highBand.averageProbabilityFraction - 0.95) < 1e-12);
});

test('calibrationBuckets clamps out-of-range probabilities defensively', () => {
  const buckets = calibrationBuckets([settled(1.2, 'hit')], 4);
  const lastBand = buckets[3];
  assert.ok(lastBand !== undefined);
  assert.equal(lastBand.pickCount, 1);
});
