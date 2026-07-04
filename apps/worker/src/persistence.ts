import type { CallCategory, CallPredicate } from '@calledit/engine';
import type { Result } from '@calledit/txline';

/**
 * Persistence port for the game service. Two adapters implement it: memory
 * (tests, and fallback when Supabase credentials are absent) and Supabase
 * (production). All methods return errors as values; adapter error strings
 * start with a stable code so the service can branch on them.
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

export type PickStatus = 'pending' | 'hit' | 'miss';

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

export interface LeaderboardEntry {
  playerId: string;
  handle: string;
  totalPoints: number;
  currentStreak: number;
  bestStreak: number;
}

export interface FixtureLeaderboardEntry {
  playerId: string;
  handle: string;
  fixturePoints: number;
}

/** A settled pick reduced to what calibration and margin math need. */
export interface SettledPickView {
  probabilityFraction: number;
  outcome: 'hit' | 'miss';
  pointsAwarded: number;
  fixtureId: number;
}

// Stable error codes adapters prefix their error strings with.
export const PERSISTENCE_ERROR_DUPLICATE_CATEGORY = 'duplicate_category';
export const PERSISTENCE_ERROR_NOT_PENDING = 'not_pending';

export interface PersistencePort {
  describeBackend(): string;
  createPlayer(handle: string, tokenHash: string): Promise<Result<PlayerRecord, string>>;
  getPlayer(playerId: string): Promise<Result<PlayerRecord | null, string>>;
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
}
