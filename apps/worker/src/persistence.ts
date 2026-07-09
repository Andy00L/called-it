import type { Result } from '@calledit/txline';
import type {
  FixtureLeaderboardEntry,
  LeaderboardEntry,
  MerkleProofStep,
  PickRecord,
  PickStatus,
} from '@calledit/contracts';

/**
 * Persistence port for the game service. Two adapters implement it: memory
 * (tests, and fallback when Supabase credentials are absent) and Supabase
 * (production). All methods return errors as values; adapter error strings
 * start with a stable code so the service can branch on them.
 *
 * Wire-visible shapes (PickRecord, leaderboard rows) live in
 * @calledit/contracts; they are re-exported here so adapters keep a single
 * import site.
 */

export interface PlayerRecord {
  id: string;
  handle: string;
  /** sha256 hex of the player's secret token (guest auth v1). */
  tokenHash: string;
  totalPoints: number;
  currentStreak: number;
  bestStreak: number;
}

export type { FixtureLeaderboardEntry, LeaderboardEntry, PickRecord, PickStatus };

export interface SettlementInput {
  pickId: string;
  /** Null for ghost picks: only the pick status flips, no player aggregates. */
  playerId: string | null;
  outcome: 'hit' | 'miss';
  pointsAwarded: number;
  streakMultiplier: number;
  resolutionClockSeconds: number;
  newStreak: number;
}

/** A settled pick reduced to what calibration and margin math need. */
export interface SettledPickView {
  probabilityFraction: number;
  outcome: 'hit' | 'miss';
  pointsAwarded: number;
  fixtureId: number;
}

/** One commitment batch as persisted (commitments table). */
export interface CommitmentRecord {
  id: string;
  rootHashHex: string;
  memoTxSig: string | null;
  pickCount: number;
  createdAtMs: number;
}

/** Per-pick assignment written alongside a commitment batch. */
export interface CommitmentAssignment {
  pickId: string;
  leafIndex: number;
  proof: MerkleProofStep[];
}

/** Raw receipt data joined by the adapter; enrichment happens in main. */
export interface ReceiptRecord {
  pick: PickRecord;
  playerHandle: string | null;
  settlement: { outcome: 'hit' | 'miss'; pointsAwarded: number } | null;
  commitment: CommitmentRecord | null;
  leafIndex: number | null;
  proof: MerkleProofStep[] | null;
}

// Stable error codes adapters prefix their error strings with.
export const PERSISTENCE_ERROR_DUPLICATE_CATEGORY = 'duplicate_category';
export const PERSISTENCE_ERROR_NOT_PENDING = 'not_pending';

export interface PersistencePort {
  describeBackend(): string;
  createPlayer(handle: string, tokenHash: string): Promise<Result<PlayerRecord, string>>;
  getPlayer(playerId: string): Promise<Result<PlayerRecord | null, string>>;
  /** Rename a player; leaderboards and receipts read the handle live. */
  updatePlayerHandle(playerId: string, handle: string): Promise<Result<void, string>>;
  /** Insert the human pick and its ghost mirror in one atomic write. */
  insertPickPair(
    humanPick: PickRecord,
    bookiePick: PickRecord | null,
  ): Promise<Result<void, string>>;
  listPendingPicks(): Promise<Result<PickRecord[], string>>;
  settlePick(input: SettlementInput): Promise<Result<void, string>>;
  leaderboardGlobal(limit: number): Promise<Result<LeaderboardEntry[], string>>;
  leaderboardFixture(
    fixtureId: number,
    limit: number,
  ): Promise<Result<FixtureLeaderboardEntry[], string>>;
  /** Settled human picks of one player (calibration + totals). */
  listSettledPicksForPlayer(playerId: string): Promise<Result<SettledPickView[], string>>;
  /** Settled ghost picks mirroring that player's picks (bookie margin). */
  listSettledBookiePicksAgainstPlayer(
    playerId: string,
  ): Promise<Result<SettledPickView[], string>>;
  /** Picks not yet included in any commitment batch, oldest lock first. */
  listUncommittedPicks(): Promise<Result<PickRecord[], string>>;
  /** Write one commitment batch and attach proof paths to its picks. */
  recordCommitment(
    commitment: CommitmentRecord,
    assignments: readonly CommitmentAssignment[],
  ): Promise<Result<void, string>>;
  /** Everything the public receipt needs; null when the pick is unknown. */
  getReceipt(pickId: string): Promise<Result<ReceiptRecord | null, string>>;
}
