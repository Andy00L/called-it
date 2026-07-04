/**
 * Rolling feed latency: payload Ts (set by TxLINE at emit time) versus the
 * worker's arrival clock. Powers the latency HUD in the app and the measured
 * "goal visible in under N seconds" claim in the demo video.
 */

// Sample window: large enough to smooth a busy spell, small enough that a
// sort per snapshot stays trivial (product choice, v1).
const DEFAULT_LATENCY_WINDOW = 200;

import type { LatencySnapshot } from '@calledit/contracts';

export interface LatencyTracker {
  windowSize: number;
  samplesMs: number[];
  nextIndex: number;
  lastMs: number | null;
}

export type { LatencySnapshot };

export function createLatencyTracker(windowSize: number = DEFAULT_LATENCY_WINDOW): LatencyTracker {
  return { windowSize: Math.max(1, Math.floor(windowSize)), samplesMs: [], nextIndex: 0, lastMs: null };
}

/** Record one observation. Clock skew can make the difference negative; clamp to zero. */
export function recordLatency(
  tracker: LatencyTracker,
  payloadTsMs: number,
  receivedAtMs: number,
): void {
  const latencyMs = Math.max(0, receivedAtMs - payloadTsMs);
  tracker.lastMs = latencyMs;
  if (tracker.samplesMs.length < tracker.windowSize) {
    tracker.samplesMs.push(latencyMs);
  } else {
    tracker.samplesMs[tracker.nextIndex] = latencyMs;
  }
  tracker.nextIndex = (tracker.nextIndex + 1) % tracker.windowSize;
}

function percentileFromSorted(sortedMs: readonly number[], fraction: number): number {
  const lastIndex = sortedMs.length - 1;
  const position = Math.min(lastIndex, Math.max(0, Math.round(lastIndex * fraction)));
  return sortedMs[position] ?? 0;
}

export function snapshotLatency(tracker: LatencyTracker): LatencySnapshot | null {
  if (tracker.lastMs === null || tracker.samplesMs.length === 0) {
    return null;
  }
  const sortedMs = [...tracker.samplesMs].sort(
    (leftMs, rightMs) => leftMs - rightMs,
  );
  return {
    lastMs: tracker.lastMs,
    p50Ms: percentileFromSorted(sortedMs, 0.5),
    p95Ms: percentileFromSorted(sortedMs, 0.95),
    sampleCount: sortedMs.length,
  };
}
