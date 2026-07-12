import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  calibrationBuckets,
  computeBookieMargin,
  edgeVsMarket,
  findNearMissEvent,
  generateCalls,
  marketBrierScore,
  nextStreak,
  pickBookieOption,
  resolveEventWindow,
  resolveProbHold,
  streakMultiplier,
  type CallOption,
  type PickOutcome,
  type SettledPick,
} from '@calledit/engine';
import { err, ok, type Result } from '@calledit/txline';
import type {
  DuelStats,
  GuestSession,
  LockResult,
  MyPickEntry,
  NearMissNotice,
  ProfilePayload,
  SettlementNotice,
} from '@calledit/contracts';
import type {
  FixtureLeaderboardEntry,
  LeaderboardEntry,
  PersistencePort,
  PickRecord,
  PlayerRecord,
} from './persistence.js';
import {
  PERSISTENCE_ERROR_DUPLICATE_CATEGORY,
  PERSISTENCE_ERROR_NOT_PENDING,
  PERSISTENCE_ERROR_WALLET_TAKEN,
} from './persistence.js';
import { getMatchState, isInRunning, type MatchState, type MatchStateStore } from './state.js';
import type { WalletChallenge, WalletVerifier } from './wallet-auth.js';

/**
 * The game service: guest players, pick locking with The Bookie's ghost
 * mirror, resolution against live match state, atomic settlement with
 * streaks, and skill profiles (calibration + margin versus the market).
 * Pure game math lives in @calledit/engine; this module orchestrates it
 * against the persistence port and the in-memory match state.
 */

// A call cannot be locked with less than this left in its window
// (sourceRef: build plan rule "no call under 2 minutes from window end").
const MIN_WINDOW_REMAINING_SECONDS = 120;

// A matching event this long past the window still reads as "so close";
// anything later is unrelated play (product choice for the honest near-miss).
// Exported: main.ts recomputes read-time near-misses with the same horizon.
export const NEAR_MISS_HORIZON_SECONDS = 300;

// Duel stats window: the lobby line covers the last day of settled picks.
const DUEL_STATS_WINDOW_MS = 24 * 60 * 60 * 1000;

// Default number of rows returned by leaderboard queries (product choice).
const LEADERBOARD_LIMIT = 50;

// Handle: letters, numbers, space, underscore, dot, hyphen; 2 to 24 chars
// (mirrors the players.handle check constraint in 0001_init.sql).
const HANDLE_PATTERN = /^[\p{L}\p{N} _.-]{2,24}$/u;

// Impersonating the ghost opponent would corrupt the product story.
const RESERVED_HANDLES = ['the bookie'];

// Wire-visible shapes live in the shared contract; re-exported for existing
// import sites (tests, main).
export type { GuestSession, LockResult, ProfilePayload, SettlementNotice };

export interface GameServiceDeps {
  persistence: PersistencePort;
  store: MatchStateStore;
  /** Verifies wallet-ownership challenges for the optional profile link. */
  walletVerifier: WalletVerifier;
  /** Called after each successful settlement (SSE fan-out). */
  onSettlement?: (notice: SettlementNotice) => void;
  /** Called when a missed window's event arrives just late (SSE fan-out). */
  onNearMiss?: (notice: NearMissNotice) => void;
  /** Injectable clock for tests; defaults to Date.now. */
  nowMs?: () => number;
}

export interface GameService {
  hydratePendingPicks(): Promise<void>;
  createGuestPlayer(rawHandle: unknown): Promise<Result<GuestSession, string>>;
  renameHandle(
    rawPlayerId: unknown,
    rawPlayerToken: unknown,
    rawHandle: unknown,
  ): Promise<Result<{ playerId: string; handle: string }, string>>;
  lockPick(
    rawPlayerId: unknown,
    rawPlayerToken: unknown,
    rawFixtureId: unknown,
    rawOptionId: unknown,
  ): Promise<Result<LockResult, string>>;
  resolveFixture(fixtureId: number): Promise<void>;
  leaderboardGlobal(): Promise<Result<LeaderboardEntry[], string>>;
  leaderboardFixture(fixtureId: number): Promise<Result<FixtureLeaderboardEntry[], string>>;
  profile(rawPlayerId: unknown): Promise<Result<ProfilePayload, string>>;
  /** The authenticated player's picks on one fixture (the reload restore). */
  listPlayerFixturePicks(
    rawPlayerId: unknown,
    rawPlayerToken: unknown,
    rawFixtureId: unknown,
  ): Promise<Result<MyPickEntry[], string>>;
  /** Fans-versus-Bookie counters over the last day (the lobby duel line). */
  duelStats(): Promise<Result<DuelStats, string>>;
  /** Issue a fresh single-use wallet-ownership challenge to sign. */
  issueWalletChallenge(): WalletChallenge;
  /** Link a wallet to the authenticated guest (claim their profile). */
  linkWallet(
    rawPlayerId: unknown,
    rawPlayerToken: unknown,
    rawWalletPubkey: unknown,
    rawNonce: unknown,
    rawSignature: unknown,
  ): Promise<Result<{ walletPubkey: string }, string>>;
  /** Restore the guest that owns a wallet, issuing it a fresh token. */
  restoreWallet(
    rawWalletPubkey: unknown,
    rawNonce: unknown,
    rawSignature: unknown,
  ): Promise<Result<GuestSession, string>>;
  pendingPickCount(): number;
}

function hashPlayerToken(playerToken: string): string {
  return createHash('sha256').update(playerToken).digest('hex');
}

function tokenMatchesHash(playerToken: string, expectedHash: string): boolean {
  const candidate = Buffer.from(hashPlayerToken(playerToken), 'hex');
  const expected = Buffer.from(expectedHash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function windowEndClockSeconds(option: CallOption): number {
  return option.predicate.kind === 'event_window'
    ? option.predicate.toClockSeconds
    : option.predicate.atClockSeconds;
}

export function createGameService(deps: GameServiceDeps): GameService {
  const nowMs = deps.nowMs ?? Date.now;
  /** fixtureId -> pickId -> pending pick (write-through cache over persistence). */
  const pendingByFixture = new Map<number, Map<string, PickRecord>>();
  /** fixtureId -> pickId -> missed human window awaiting its near-miss event. */
  const missedWindowsByFixture = new Map<number, Map<string, PickRecord>>();
  const fixturesResolving = new Set<number>();
  const fixturesNeedingRerun = new Set<number>();
  // Per-player settlement chain: streak is read-modify-written across two
  // async hops (getPlayer then settlePick). Picks of one player in two
  // fixtures can resolve concurrently, so serialize them per player to stop a
  // lost streak increment. The worker is single-instance; an in-process chain
  // is enough (a multi-instance deployment would move this into the RPC).
  const settlementTailByPlayer = new Map<string, Promise<void>>();

  const withPlayerSettlementLock = async (
    playerId: string,
    task: () => Promise<void>,
  ): Promise<void> => {
    const previous = settlementTailByPlayer.get(playerId) ?? Promise.resolve();
    // Run after the previous settlement whether it fulfilled or rejected, so
    // one failure never stalls the chain.
    const run = previous.then(task, task);
    const tail = run.then(
      () => undefined,
      () => undefined,
    );
    settlementTailByPlayer.set(playerId, tail);
    void tail.then(() => {
      // Drop the entry once this settlement is the chain's tail, so the map
      // does not grow one entry per player forever.
      if (settlementTailByPlayer.get(playerId) === tail) {
        settlementTailByPlayer.delete(playerId);
      }
    });
    return run;
  };

  const cachePendingPick = (pick: PickRecord): void => {
    const fixturePicks =
      pendingByFixture.get(pick.fixtureId) ?? new Map<string, PickRecord>();
    fixturePicks.set(pick.id, pick);
    pendingByFixture.set(pick.fixtureId, fixturePicks);
  };

  const authenticate = async (
    playerId: string,
    playerToken: string,
  ): Promise<Result<PlayerRecord, string>> => {
    const fetched = await deps.persistence.getPlayer(playerId);
    if (!fetched.ok) {
      return fetched;
    }
    if (fetched.value === null || !tokenMatchesHash(playerToken, fetched.value.tokenHash)) {
      return err('auth_failed');
    }
    return ok(fetched.value);
  };

  const buildCatalog = (state: MatchState): CallOption[] =>
    generateCalls({
      clockSeconds: state.clockSeconds,
      score: state.score,
      matchResult: state.matchResult,
      inRunning: isInRunning(state),
    });

  const resolveOutcome = (pick: PickRecord, state: MatchState): PickOutcome => {
    if (pick.predicate.kind === 'event_window') {
      // A finished match can no longer complete any window: force the final
      // verdict (the feed zeroes the clock at full time, so waiting on the
      // clock alone would leave picks pending forever).
      const effectiveClock =
        state.phase === 'finished' ? Number.MAX_SAFE_INTEGER : state.clockSeconds;
      return resolveEventWindow(pick.predicate, state.events, effectiveClock);
    }
    const targetTeamProbability =
      state.matchResult === null
        ? undefined
        : pick.predicate.team === 'p1'
          ? state.matchResult.p1
          : state.matchResult.p2;
    if (state.phase === 'finished' && state.clockSeconds < pick.predicate.atClockSeconds) {
      // Match ended before the target clock (abandonment edge): a hold that
      // never reached its checkpoint cannot be a hit.
      return 'miss';
    }
    return resolveProbHold(pick.predicate, targetTeamProbability, state.clockSeconds);
  };

  /** Persist one settlement and, only on a definite outcome, drop it from the cache. */
  const applySettlement = async (
    pick: PickRecord,
    outcome: 'hit' | 'miss',
    state: MatchState,
    pointsAwarded: number,
    multiplier: number,
    newStreak: number,
  ): Promise<void> => {
    const settled = await deps.persistence.settlePick({
      pickId: pick.id,
      playerId: pick.playerId,
      outcome,
      pointsAwarded,
      streakMultiplier: multiplier,
      resolutionClockSeconds: state.clockSeconds,
      newStreak,
    });
    if (!settled.ok) {
      console.error(`[settleOne] ${settled.error}`);
      // Drop from the pending cache ONLY when the row is provably no longer
      // pending (already settled by another path). A transient persistence
      // failure keeps the pick cached so the next resolve pass retries it,
      // instead of stranding it pending until a restart.
      if (settled.error.startsWith(PERSISTENCE_ERROR_NOT_PENDING)) {
        pendingByFixture.get(pick.fixtureId)?.delete(pick.id);
      }
      return;
    }
    pendingByFixture.get(pick.fixtureId)?.delete(pick.id);
    deps.onSettlement?.({ fixtureId: pick.fixtureId, pick, outcome, pointsAwarded, newStreak });
    // A missed human window arms the near-miss watch: if its event lands just
    // after the deadline, the post-mortem prints the factual margin.
    if (outcome === 'miss' && !pick.isBookie && pick.predicate.kind === 'event_window') {
      const fixtureMisses =
        missedWindowsByFixture.get(pick.fixtureId) ?? new Map<string, PickRecord>();
      fixtureMisses.set(pick.id, pick);
      missedWindowsByFixture.set(pick.fixtureId, fixtureMisses);
    }
  };

  /** Detect near-miss events for recently missed windows; drop stale watches. */
  const scanNearMisses = async (fixtureId: number, state: MatchState): Promise<void> => {
    const fixtureMisses = missedWindowsByFixture.get(fixtureId);
    if (fixtureMisses === undefined || fixtureMisses.size === 0) {
      return;
    }
    for (const pick of [...fixtureMisses.values()]) {
      if (pick.predicate.kind !== 'event_window') {
        fixtureMisses.delete(pick.id);
        continue;
      }
      const windowEnd = pick.predicate.toClockSeconds;
      const nearMissEvent = findNearMissEvent(
        pick.predicate,
        state.events,
        NEAR_MISS_HORIZON_SECONDS,
      );
      if (nearMissEvent !== null) {
        fixtureMisses.delete(pick.id);
        const recorded = await deps.persistence.recordNearMiss(
          pick.id,
          nearMissEvent.clockSeconds - windowEnd,
        );
        if (!recorded.ok) {
          // The SSE notice still fires; only durability degrades (0003 gate).
          console.warn(`[scanNearMisses] ${recorded.error}`);
        }
        deps.onNearMiss?.({
          fixtureId,
          pickId: pick.id,
          category: pick.category,
          claim: pick.claim,
          windowEndClockSeconds: windowEnd,
          eventClockSeconds: nearMissEvent.clockSeconds,
        });
        continue;
      }
      // No more events can arrive after full time, and a watch past the
      // horizon can never match: either way the entry is dead.
      if (state.phase === 'finished' || state.clockSeconds > windowEnd + NEAR_MISS_HORIZON_SECONDS) {
        fixtureMisses.delete(pick.id);
      }
    }
    if (fixtureMisses.size === 0) {
      missedWindowsByFixture.delete(fixtureId);
    }
  };

  const settleOne = async (
    pick: PickRecord,
    outcome: 'hit' | 'miss',
    state: MatchState,
  ): Promise<void> => {
    if (pick.playerId === null) {
      // The Bookie plays flat: no streak, base points only, no player row to
      // read-modify-write, so no lock needed.
      const pointsAwarded = outcome === 'hit' ? pick.potentialPoints : 0;
      await applySettlement(pick, outcome, state, pointsAwarded, 1, 0);
      return;
    }
    const playerId = pick.playerId;
    await withPlayerSettlementLock(playerId, async () => {
      const fetched = await deps.persistence.getPlayer(playerId);
      if (!fetched.ok || fetched.value === null) {
        console.error(`[settleOne] player ${playerId} unavailable, pick ${pick.id} kept pending`);
        return;
      }
      const player = fetched.value;
      const multiplier = outcome === 'hit' ? streakMultiplier(player.currentStreak) : 1;
      const pointsAwarded = outcome === 'hit' ? Math.round(pick.potentialPoints * multiplier) : 0;
      const newStreak = nextStreak(player.currentStreak, outcome);
      await applySettlement(pick, outcome, state, pointsAwarded, multiplier, newStreak);
    });
  };

  const resolveFixtureOnce = async (fixtureId: number): Promise<void> => {
    const state = getMatchState(deps.store, fixtureId);
    if (state === undefined) {
      return;
    }
    const fixturePicks = pendingByFixture.get(fixtureId);
    if (fixturePicks !== undefined && fixturePicks.size > 0) {
      for (const pick of [...fixturePicks.values()]) {
        const outcome = resolveOutcome(pick, state);
        if (outcome === 'pending') {
          continue;
        }
        await settleOne(pick, outcome, state);
      }
    }
    // Runs even with no pending picks: near-miss watches outlive settlements.
    await scanNearMisses(fixtureId, state);
  };

  return {
    hydratePendingPicks: async () => {
      const listed = await deps.persistence.listPendingPicks();
      if (!listed.ok) {
        console.error(`[hydratePendingPicks] ${listed.error}`);
        return;
      }
      for (const pick of listed.value) {
        cachePendingPick(pick);
      }
      console.log(`[hydratePendingPicks] ${listed.value.length} pending picks loaded`);
    },

    createGuestPlayer: async (rawHandle) => {
      if (typeof rawHandle !== 'string' || !HANDLE_PATTERN.test(rawHandle.trim())) {
        return err('invalid_handle: 2 to 24 letters, numbers, spaces, _ . -');
      }
      const handle = rawHandle.trim();
      // Same reserved-name guard as rename: the ghost opponent must not be
      // impersonable at creation either, or a guest could pose as The Bookie
      // on the public leaderboard.
      if (RESERVED_HANDLES.includes(handle.toLowerCase())) {
        return err('invalid_handle: reserved name');
      }
      const playerToken = `${randomUUID()}${randomUUID()}`;
      const created = await deps.persistence.createPlayer(handle, hashPlayerToken(playerToken));
      if (!created.ok) {
        return created;
      }
      return ok({ playerId: created.value.id, playerToken, handle });
    },

    renameHandle: async (rawPlayerId, rawPlayerToken, rawHandle) => {
      if (typeof rawPlayerId !== 'string' || typeof rawPlayerToken !== 'string') {
        return err('auth_failed');
      }
      if (typeof rawHandle !== 'string' || !HANDLE_PATTERN.test(rawHandle.trim())) {
        return err('invalid_handle: 2 to 24 letters, numbers, spaces, _ . -');
      }
      const handle = rawHandle.trim();
      if (RESERVED_HANDLES.includes(handle.toLowerCase())) {
        return err('invalid_handle: reserved name');
      }
      const authenticated = await authenticate(rawPlayerId, rawPlayerToken);
      if (!authenticated.ok) {
        return authenticated;
      }
      const updated = await deps.persistence.updatePlayerHandle(authenticated.value.id, handle);
      if (!updated.ok) {
        return updated;
      }
      return ok({ playerId: authenticated.value.id, handle });
    },

    lockPick: async (rawPlayerId, rawPlayerToken, rawFixtureId, rawOptionId) => {
      if (typeof rawPlayerId !== 'string' || typeof rawPlayerToken !== 'string') {
        return err('auth_failed');
      }
      const fixtureId =
        typeof rawFixtureId === 'number' ? rawFixtureId : Number.parseInt(String(rawFixtureId), 10);
      if (!Number.isInteger(fixtureId) || fixtureId <= 0) {
        return err('invalid_fixture_id');
      }
      if (typeof rawOptionId !== 'string' || rawOptionId === '') {
        return err('invalid_option_id');
      }

      const authenticated = await authenticate(rawPlayerId, rawPlayerToken);
      if (!authenticated.ok) {
        return authenticated;
      }

      const state = getMatchState(deps.store, fixtureId);
      if (state === undefined) {
        return err('unknown_fixture');
      }
      if (!isInRunning(state)) {
        return err('not_in_running');
      }
      const catalog = buildCatalog(state);
      const option = catalog.find((candidate) => candidate.id === rawOptionId);
      if (option === undefined) {
        return err('unknown_option');
      }
      if (windowEndClockSeconds(option) - state.clockSeconds < MIN_WINDOW_REMAINING_SECONDS) {
        return err('window_too_short');
      }

      const lockedAtMs = nowMs();
      const humanPick: PickRecord = {
        id: randomUUID(),
        playerId: authenticated.value.id,
        fixtureId,
        optionId: option.id,
        category: option.category,
        claim: option.label,
        predicate: option.predicate,
        probabilityFraction: option.probabilityFraction,
        potentialPoints: option.potentialPoints,
        pricingSource: option.pricingSource,
        lockedAtMs,
        lockClockSeconds: state.clockSeconds,
        isBookie: false,
        bookieOfPickId: null,
        status: 'pending',
      };
      const bookieOption = pickBookieOption(catalog, option.category);
      const bookiePick: PickRecord | null =
        bookieOption === null
          ? null
          : {
              id: randomUUID(),
              playerId: null,
              fixtureId,
              optionId: bookieOption.id,
              category: bookieOption.category,
              claim: bookieOption.label,
              predicate: bookieOption.predicate,
              probabilityFraction: bookieOption.probabilityFraction,
              potentialPoints: bookieOption.potentialPoints,
              pricingSource: bookieOption.pricingSource,
              lockedAtMs,
              lockClockSeconds: state.clockSeconds,
              isBookie: true,
              bookieOfPickId: humanPick.id,
              status: 'pending',
            };

      const inserted = await deps.persistence.insertPickPair(humanPick, bookiePick);
      if (!inserted.ok) {
        if (inserted.error.startsWith(PERSISTENCE_ERROR_DUPLICATE_CATEGORY)) {
          return err('duplicate_category');
        }
        return inserted;
      }
      cachePendingPick(humanPick);
      if (bookiePick !== null) {
        cachePendingPick(bookiePick);
      }
      return ok({ pick: humanPick, bookiePick });
    },

    resolveFixture: async (fixtureId) => {
      // Coalesce concurrent calls: one resolution runs per fixture, and a
      // burst of updates during a run triggers exactly one rerun.
      if (fixturesResolving.has(fixtureId)) {
        fixturesNeedingRerun.add(fixtureId);
        return;
      }
      fixturesResolving.add(fixtureId);
      try {
        do {
          fixturesNeedingRerun.delete(fixtureId);
          await resolveFixtureOnce(fixtureId);
        } while (fixturesNeedingRerun.has(fixtureId));
      } finally {
        fixturesResolving.delete(fixtureId);
      }
    },

    leaderboardGlobal: () => deps.persistence.leaderboardGlobal(LEADERBOARD_LIMIT),

    leaderboardFixture: (fixtureId) =>
      deps.persistence.leaderboardFixture(fixtureId, LEADERBOARD_LIMIT),

    profile: async (rawPlayerId) => {
      if (typeof rawPlayerId !== 'string' || rawPlayerId === '') {
        return err('invalid_player_id');
      }
      const fetched = await deps.persistence.getPlayer(rawPlayerId);
      if (!fetched.ok) {
        return fetched;
      }
      if (fetched.value === null) {
        return err('unknown_player');
      }
      const player = fetched.value;

      const settledHuman = await deps.persistence.listSettledPicksForPlayer(player.id);
      if (!settledHuman.ok) {
        return settledHuman;
      }
      const settledGhost = await deps.persistence.listSettledBookiePicksAgainstPlayer(player.id);
      if (!settledGhost.ok) {
        return settledGhost;
      }
      const humanSlate: SettledPick[] = settledHuman.value.map((view) => ({
        probabilityFraction: view.probabilityFraction,
        outcome: view.outcome,
        pointsAwarded: view.pointsAwarded,
      }));
      const ghostSlate: SettledPick[] = settledGhost.value.map((view) => ({
        probabilityFraction: view.probabilityFraction,
        outcome: view.outcome,
        pointsAwarded: view.pointsAwarded,
      }));

      return ok({
        playerId: player.id,
        handle: player.handle,
        totalPoints: player.totalPoints,
        currentStreak: player.currentStreak,
        bestStreak: player.bestStreak,
        settledPickCount: humanSlate.length,
        edgeVsMarket: edgeVsMarket(humanSlate),
        marketBrierScore: marketBrierScore(humanSlate),
        calibration: calibrationBuckets(humanSlate),
        bookie: computeBookieMargin(humanSlate, ghostSlate),
        walletPubkey: player.walletPubkey,
      });
    },

    listPlayerFixturePicks: async (rawPlayerId, rawPlayerToken, rawFixtureId) => {
      if (typeof rawPlayerId !== 'string' || typeof rawPlayerToken !== 'string') {
        return err('auth_failed');
      }
      const fixtureId =
        typeof rawFixtureId === 'number' ? rawFixtureId : Number.parseInt(String(rawFixtureId), 10);
      if (!Number.isInteger(fixtureId) || fixtureId <= 0) {
        return err('invalid_fixture_id');
      }
      const authenticated = await authenticate(rawPlayerId, rawPlayerToken);
      if (!authenticated.ok) {
        return authenticated;
      }
      return deps.persistence.listPicksForPlayerFixture(authenticated.value.id, fixtureId);
    },

    duelStats: () => deps.persistence.duelStats(nowMs() - DUEL_STATS_WINDOW_MS),

    issueWalletChallenge: () => deps.walletVerifier.issueChallenge(),

    linkWallet: async (rawPlayerId, rawPlayerToken, rawWalletPubkey, rawNonce, rawSignature) => {
      if (typeof rawPlayerId !== 'string' || typeof rawPlayerToken !== 'string') {
        return err('auth_failed');
      }
      const authenticated = await authenticate(rawPlayerId, rawPlayerToken);
      if (!authenticated.ok) {
        return authenticated;
      }
      const verified = deps.walletVerifier.verify(rawNonce, rawWalletPubkey, rawSignature);
      if (!verified.ok) {
        return verified;
      }
      const linked = await deps.persistence.linkWallet(
        authenticated.value.id,
        verified.value.walletPubkey,
      );
      if (!linked.ok) {
        if (linked.error.startsWith(PERSISTENCE_ERROR_WALLET_TAKEN)) {
          return err('wallet_taken');
        }
        return linked;
      }
      return ok({ walletPubkey: verified.value.walletPubkey });
    },

    restoreWallet: async (rawWalletPubkey, rawNonce, rawSignature) => {
      const verified = deps.walletVerifier.verify(rawNonce, rawWalletPubkey, rawSignature);
      if (!verified.ok) {
        return verified;
      }
      const found = await deps.persistence.getPlayerByWallet(verified.value.walletPubkey);
      if (!found.ok) {
        return found;
      }
      if (found.value === null) {
        return err('wallet_unlinked');
      }
      // Proving wallet ownership issues a FRESH token bound to the same player,
      // rotating the old one (the new device becomes the session).
      const playerToken = `${randomUUID()}${randomUUID()}`;
      const rotated = await deps.persistence.rotatePlayerToken(
        found.value.id,
        hashPlayerToken(playerToken),
      );
      if (!rotated.ok) {
        return rotated;
      }
      return ok({ playerId: found.value.id, playerToken, handle: found.value.handle });
    },

    pendingPickCount: () => {
      let total = 0;
      for (const fixturePicks of pendingByFixture.values()) {
        total += fixturePicks.size;
      }
      return total;
    },
  };
}
