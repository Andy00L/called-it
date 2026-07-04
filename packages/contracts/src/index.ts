import type {
  CallOption,
  MatchEvent,
  MatchResultProbabilities,
} from '@calledit/engine';

/**
 * Wire contract between the worker HTTP/SSE API and its clients (apps/web).
 * The worker composes these payloads; the web app consumes them. Keeping the
 * shapes here avoids an app-to-app import in either direction.
 */

export type MatchPhase = 'pre' | 'live' | 'finished';

export interface LatencySnapshot {
  lastMs: number;
  p50Ms: number;
  p95Ms: number;
  sampleCount: number;
}

/** Shape served on the SSE channel /live/:fixtureId ("state" events). */
export interface LivePayload {
  fixtureId: number;
  phase: MatchPhase;
  clockSeconds: number;
  clockRunning: boolean;
  goalsP1: number;
  goalsP2: number;
  score: unknown;
  matchResult: MatchResultProbabilities | null;
  eventCount: number;
  recentEvents: MatchEvent[];
  catalog: CallOption[];
  bookieDeck: CallOption[];
  latency: { scores: LatencySnapshot | null; odds: LatencySnapshot | null };
  updatedAtMs: number;
}

/** One row of GET /fixtures: fixture metadata merged with live state. */
export interface FixtureSummary {
  fixtureId: number;
  competition: string;
  participant1: string;
  participant2: string;
  startTimeMs: number;
  phase: MatchPhase;
  clockSeconds: number;
  goalsP1: number;
  goalsP2: number;
  matchResult: MatchResultProbabilities | null;
  /** 0 when no stream data has arrived for this fixture yet. */
  updatedAtMs: number;
}

export type { CallOption, MatchEvent, MatchResultProbabilities };
