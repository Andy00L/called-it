import { generateCalls, pickBookieDeck, readStat } from '@calledit/engine';
import type { LivePayload } from '@calledit/contracts';
import { snapshotLatency, type LatencyTracker } from './latency.js';
import { isInRunning, type MatchState } from './state.js';

/**
 * Shared LivePayload composition: the live path (main.ts, global store) and
 * the Time Machine replay path (replay.ts, per-session store) must serve the
 * exact same frame shape so the web client renders both with one code path.
 */

// Events included in live payloads; the full timeline stays in the tape.
export const LIVE_PAYLOAD_EVENT_LIMIT = 50;

export function buildLivePayloadForState(
  state: MatchState,
  scoresLatency: LatencyTracker,
  oddsLatency: LatencyTracker,
): LivePayload {
  const catalog = generateCalls({
    clockSeconds: state.clockSeconds,
    score: state.score,
    matchResult: state.matchResult,
    inRunning: isInRunning(state),
  });
  return {
    fixtureId: state.fixtureId,
    phase: state.phase,
    clockSeconds: state.clockSeconds,
    clockRunning: state.clockRunning,
    goalsP1: readStat(state.score, 'goals', 'p1'),
    goalsP2: readStat(state.score, 'goals', 'p2'),
    score: state.score,
    matchResult: state.matchResult,
    eventCount: state.events.length,
    recentEvents: state.events.slice(-LIVE_PAYLOAD_EVENT_LIMIT),
    catalog,
    bookieDeck: pickBookieDeck(catalog),
    latency: { scores: snapshotLatency(scoresLatency), odds: snapshotLatency(oddsLatency) },
    updatedAtMs: state.updatedAtMs,
  };
}
