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

/** One row of GET /replay/tapes: a finished match available for replay. */
export interface ReplayTapeSummary {
  fixtureId: number;
  competition: string;
  participant1: string;
  participant2: string;
  sizeBytes: number;
  /** Last tape write, epoch ms; doubles as "when the match ended" roughly. */
  updatedAtMs: number;
}

/** Replay session state, returned by the /replay/sessions endpoints. */
export interface ReplaySessionInfo {
  sessionId: string;
  fixtureId: number;
  /** Playback speed multiplier over the original arrival gaps. */
  speed: number;
  startedAtMs: number;
  finished: boolean;
  appliedEntries: number;
  totalEntries: number;
}

/** POST /replay/sessions response. */
export interface ReplayCreateResult {
  session: ReplaySessionInfo;
}

/** One step of a Merkle inclusion proof (sha256, hex encoded). */
export interface MerkleProofStep {
  siblingHashHex: string;
  isRightSibling: boolean;
}

/** On-chain commitment data attached to one pick. */
export interface PickCommitment {
  commitmentId: string;
  rootHashHex: string;
  /** Solana Memo transaction carrying the root; null until posted. */
  memoTxSig: string | null;
  leafIndex: number;
  leafHashHex: string;
  proof: MerkleProofStep[];
  pickCount: number;
  committedAtMs: number;
}

export type OracleVerificationStatus = 'verified' | 'mismatch' | 'pending' | 'unavailable';

/** One final stat pair proven against TxODDS's on-chain daily root. */
export interface OracleProvenFinal {
  label: string;
  p1: number;
  p2: number;
}

/**
 * Result of cross-checking the fixture's final stats against the Txoracle
 * program (validate_stat .view(), read-only). 'verified' = the finals the
 * receipt shows recompute to true against the on-chain Merkle root;
 * 'pending' = the daily root is not posted yet; 'mismatch' should never
 * happen and is surfaced loudly.
 */
export interface OracleVerification {
  status: OracleVerificationStatus;
  /** Distinct machine-readable reason when status is not 'verified'. */
  reason?: string;
  checkedAtMs: number;
  epochDay?: number;
  provenFinals?: OracleProvenFinal[];
  /** Scores event the proof anchors to (newest scored record). */
  eventSeq?: number;
  eventTs?: number;
}

/** GET /receipts/:pickId response: everything the public receipt shows. */
export interface ReceiptPayload {
  pick: PickRecord;
  playerHandle: string | null;
  settlement: { outcome: 'hit' | 'miss'; pointsAwarded: number } | null;
  commitment: PickCommitment | null;
  /** Worker-side re-verification: leaf + proof recomputes the root. */
  proofValid: boolean | null;
  /** TxODDS oracle cross-check; null when the pick is unsettled or the verifier is off. */
  oracleVerification: OracleVerification | null;
  fixture: { participant1: string; participant2: string; competition: string } | null;
  network: 'mainnet' | 'devnet';
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

// Value re-export so clients can show the real streak math without
// duplicating the formula. The subpath keeps browser bundles off the full
// engine index (points.ts is dependency-free).
export { streakMultiplier } from '@calledit/engine/points';
