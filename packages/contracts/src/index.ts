import type {
  BookieMargin,
  CalibrationBucket,
  CallCategory,
  CallOption,
  CallPredicate,
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

/** POST /players/guest response. The token is shown once; store it client-side. */
export interface GuestSession {
  playerId: string;
  playerToken: string;
  handle: string;
}

export type PickStatus = 'pending' | 'hit' | 'miss';

/** One locked call, human or ghost (The Bookie), as persisted and served. */
export interface PickRecord {
  id: string;
  /** Null for The Bookie's ghost picks. */
  playerId: string | null;
  fixtureId: number;
  optionId: string;
  category: CallCategory;
  claim: string;
  predicate: CallPredicate;
  /** Market or model probability locked at tap time, fraction in (0, 1]. */
  probabilityFraction: number;
  potentialPoints: number;
  pricingSource: 'market' | 'model';
  lockedAtMs: number;
  lockClockSeconds: number;
  isBookie: boolean;
  bookieOfPickId: string | null;
  status: PickStatus;
}

/** POST /picks response: the human pick plus The Bookie's mirror. */
export interface LockResult {
  pick: PickRecord;
  bookiePick: PickRecord | null;
}

/** SSE "settlement" event on /live/:fixtureId, one per settled pick. */
export interface SettlementNotice {
  fixtureId: number;
  pick: PickRecord;
  outcome: 'hit' | 'miss';
  pointsAwarded: number;
  /** The player's streak after this settlement; always 0 for ghost picks. */
  newStreak: number;
}

/** One row of GET /leaderboard. */
export interface LeaderboardEntry {
  playerId: string;
  handle: string;
  totalPoints: number;
  currentStreak: number;
  bestStreak: number;
}

/** One row of GET /leaderboard/:fixtureId. */
export interface FixtureLeaderboardEntry {
  playerId: string;
  handle: string;
  fixturePoints: number;
}

/** GET /profile/:playerId response: the skill profile. */
export interface ProfilePayload {
  playerId: string;
  handle: string;
  totalPoints: number;
  currentStreak: number;
  bestStreak: number;
  settledPickCount: number;
  edgeVsMarket: number | null;
  marketBrierScore: number | null;
  calibration: CalibrationBucket[];
  bookie: BookieMargin;
}

export type {
  BookieMargin,
  CalibrationBucket,
  CallCategory,
  CallOption,
  CallPredicate,
  MatchEvent,
  MatchResultProbabilities,
};
