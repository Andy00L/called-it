import type { Result } from '@calledit/txline';
import type {
  DuelStats,
  FixtureLeaderboardEntry,
  LeaderboardEntry,
  MerkleProofStep,
  MyPickEntry,
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
  /** Linked Solana wallet (base58), or null when the profile is guest-only. */
  walletPubkey: string | null;
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
  settlement: {
    outcome: 'hit' | 'miss';
    pointsAwarded: number;
    /** Near-miss margin persisted with the settlement; null when none/unknown. */
    nearMissSeconds: number | null;
  } | null;
  commitment: CommitmentRecord | null;
  leafIndex: number | null;
  proof: MerkleProofStep[] | null;
}

// Stable error codes adapters prefix their error strings with.
export const PERSISTENCE_ERROR_DUPLICATE_CATEGORY = 'duplicate_category';
export const PERSISTENCE_ERROR_NOT_PENDING = 'not_pending';
export const PERSISTENCE_ERROR_WALLET_TAKEN = 'wallet_taken';
export const PERSISTENCE_ERROR_TX_USED = 'tx_already_used';
export const PERSISTENCE_ERROR_TERRACE_CODE_TAKEN = 'terrace_code_taken';

/** One terrace room row (terraces table, 0005_terraces.sql). */
export interface TerraceRecord {
  code: string;
  fixtureId: number;
  name: string;
  ownerPlayerId: string;
  createdAtMs: number;
}

/** One terrace member with the display handle joined in. */
export interface TerraceMemberEntry {
  playerId: string;
  handle: string;
}

/** One player's settled points on one fixture (terrace standings input). */
export interface FixturePointsEntry {
  playerId: string;
  fixturePoints: number;
}

/** One self-serve sponsorship (sponsors table, 0004_sponsors.sql). */
export interface SponsorRecord {
  id: string;
  name: string;
  tagline: string | null;
  /** Screen-time tier, 1 to 3 (ticker loop repetitions). */
  weight: number;
  days: number;
  quoteLamports: number;
  status: 'pending' | 'active';
  payerPubkey: string | null;
  txSig: string | null;
  paidLamports: number | null;
  createdAtMs: number;
  startsAtMs: number | null;
  endsAtMs: number | null;
}

/** Activation write: the verified payment attached to a pending intent. */
export interface SponsorActivationInput {
  id: string;
  txSig: string;
  payerPubkey: string;
  paidLamports: number;
  startsAtMs: number;
  endsAtMs: number;
}

export interface PersistencePort {
  describeBackend(): string;
  createPlayer(handle: string, tokenHash: string): Promise<Result<PlayerRecord, string>>;
  getPlayer(playerId: string): Promise<Result<PlayerRecord | null, string>>;
  /** Find a player by their linked wallet (base58); null when unlinked. */
  getPlayerByWallet(walletPubkey: string): Promise<Result<PlayerRecord | null, string>>;
  /** Rename a player; leaderboards and receipts read the handle live. */
  updatePlayerHandle(playerId: string, handle: string): Promise<Result<void, string>>;
  /** Link a wallet to a player; `wallet_taken` when another player owns it. */
  linkWallet(playerId: string, walletPubkey: string): Promise<Result<void, string>>;
  /** Rotate a player's token hash (wallet restore issues a fresh token). */
  rotatePlayerToken(playerId: string, tokenHash: string): Promise<Result<void, string>>;
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
  /** One player's picks on one fixture with settlements and Bookie mirrors
   *  (the reload restore), oldest lock first. */
  listPicksForPlayerFixture(
    playerId: string,
    fixtureId: number,
  ): Promise<Result<MyPickEntry[], string>>;
  /** Attach the near-miss margin to an already settled pick. Requires the
   *  0003 migration on Supabase; the caller logs and continues on failure. */
  recordNearMiss(pickId: string, nearMissSeconds: number): Promise<Result<void, string>>;
  /** Fans-versus-Bookie counters over picks locked since the given time. */
  duelStats(sinceMs: number): Promise<Result<DuelStats, string>>;
  /** Reserve a priced sponsorship intent (status pending). */
  createSponsorIntent(record: SponsorRecord): Promise<Result<void, string>>;
  getSponsor(sponsorId: string): Promise<Result<SponsorRecord | null, string>>;
  /** Flip a pending intent to active with its verified payment; the tx
   *  signature is unique across sponsorships (`tx_already_used`). */
  activateSponsor(input: SponsorActivationInput): Promise<Result<void, string>>;
  /** Active sponsorships whose window covers nowMs, heaviest first. */
  listActiveSponsors(nowMs: number): Promise<Result<SponsorRecord[], string>>;
  /** Insert a terrace; `terrace_code_taken` when the code collides. */
  createTerrace(record: TerraceRecord): Promise<Result<void, string>>;
  getTerrace(code: string): Promise<Result<TerraceRecord | null, string>>;
  /** Idempotent membership insert: joining twice is a no-op. */
  addTerraceMember(code: string, playerId: string): Promise<Result<void, string>>;
  /** Members with handles, oldest join first. */
  listTerraceMembers(code: string): Promise<Result<TerraceMemberEntry[], string>>;
  /** Settled fixture points for exactly the given players (0-point players
   *  are simply absent; the caller fills the gaps). */
  fixturePointsForPlayers(
    fixtureId: number,
    playerIds: readonly string[],
  ): Promise<Result<FixturePointsEntry[], string>>;
  /** The Bookie's settled points on ghost mirrors of the given players'
   *  picks on one fixture (the terrace's house rival score). */
  bookieFixturePointsAgainstPlayers(
    fixtureId: number,
    playerIds: readonly string[],
  ): Promise<Result<number, string>>;
}
