import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLatencyTracker, recordLatency, snapshotLatency } from './latency.js';

test('snapshot is null before any sample', () => {
  const tracker = createLatencyTracker();
  assert.equal(snapshotLatency(tracker), null);
});

test('records latency and reports last plus percentiles', () => {
  const tracker = createLatencyTracker(10);
  recordLatency(tracker, 1000, 1400);
  recordLatency(tracker, 2000, 2100);
  recordLatency(tracker, 3000, 3900);

  const snapshot = snapshotLatency(tracker);
  assert.ok(snapshot !== null);
  assert.equal(snapshot.lastMs, 900);
  assert.equal(snapshot.sampleCount, 3);
  assert.equal(snapshot.p50Ms, 400);
  assert.equal(snapshot.p95Ms, 900);
});

test('clamps negative differences from clock skew to zero', () => {
  const tracker = createLatencyTracker(4);
  recordLatency(tracker, 5000, 4900);
  const snapshot = snapshotLatency(tracker);
  assert.ok(snapshot !== null);
  assert.equal(snapshot.lastMs, 0);
});

test('window is bounded: old samples fall out', () => {
  const tracker = createLatencyTracker(2);
  recordLatency(tracker, 0, 1000);
  recordLatency(tracker, 0, 10);
  recordLatency(tracker, 0, 20);
  const snapshot = snapshotLatency(tracker);
  assert.ok(snapshot !== null);
  assert.equal(snapshot.sampleCount, 2);
  // The 1000ms sample was evicted; the window now holds 10 and 20.
  assert.equal(snapshot.p95Ms, 20);
});
