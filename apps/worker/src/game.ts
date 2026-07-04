import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  calibrationBuckets,
  computeBookieMargin,
  edgeVsMarket,
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
  GuestSession,
  LockResult,
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
import { PERSISTENCE_ERROR_DUPLICATE_CATEGORY } from './persistence.js';
import { getMatchState, isInRunning, type MatchState, type MatchStateStore } from './state.js';

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

// Default number of rows returned by leaderboard queries (product choice).
const LEADERBOARD_LIMIT = 50;

// Handle: letters, numbers, space, underscore, dot, hyphen; 2 to 24 chars
// (mirrors the players.handle check constraint in 0001_init.sql).
const HANDLE_PATTERN = /^[\p{L}\p{N} _.-]{2,24}$/u;

// Wire-visible shapes live in the shared contract; re-exported for existing
// import sites (tests, main).
export type { GuestSession, LockResult, ProfilePayload, SettlementNotice };

export interface GameServiceDeps {
  persistence: PersistencePort;
  store: MatchStateStore;
  /** Called after each successful settlement (SSE fan-out). */
  onSettlement?: (notice: SettlementNotice) => void;
  /** Injectable clock for tests; defaults to Date.now. */
  nowMs?: () => number;
}

export interface GameService {
  hydratePendingPicks(): Promise<void>;
  createGuestPlayer(rawHandle: unknown): Promise<Result<GuestSession, string>>;
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
  const fixturesResolving = new Set<number>();
  const fixturesNeedingRerun = new Set<number>();

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

  const settleOne = async (
    pick: PickRecord,
    outcome: 'hit' | 'miss',
    state: MatchState,
  ): Promise<void> => {
    let pointsAwarded = 0;
    let multiplier = 1;
    let newStreak = 0;

    if (pick.playerId !== null) {
      const fetched = await deps.persistence.getPlayer(pick.playerId);
      if (!fetched.ok || fetched.value === null) {
        console.error(`[settleOne] player ${pick.playerId} unavailable, pick ${pick.id} kept pending`);
        return;
      }
      const player = fetched.value;
      multiplier = outcome === 'hit' ? streakMultiplier(player.currentStreak) : 1;
      pointsAwarded = outcome === 'hit' ? Math.round(pick.potentialPoints * multiplier) : 0;
      newStreak = nextStreak(player.currentStreak, outcome);
    } else {
      // The Bookie plays flat: no streak, base points only.
      pointsAwarded = outcome === 'hit' ? pick.potentialPoints : 0;
    }

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
    }
    // Either settled or provably not pending anymore: drop from the cache.
    pendingByFixture.get(pick.fixtureId)?.delete(pick.id);
    if (settled.ok) {
      deps.onSettlement?.({ fixtureId: pick.fixtureId, pick, outcome, pointsAwarded, newStreak });
    }
  };

  const resolveFixtureOnce = async (fixtureId: number): Promise<void> => {
    const state = getMatchState(deps.store, fixtureId);
    const fixturePicks = pendingByFixture.get(fixtureId);
    if (state === undefined || fixturePicks === undefined || fixturePicks.size === 0) {
      return;
    }
    for (const pick of [...fixturePicks.values()]) {
      const outcome = resolveOutcome(pick, state);
      if (outcome === 'pending') {
        continue;
      }
      await settleOne(pick, outcome, state);
    }
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
      const playerToken = `${randomUUID()}${randomUUID()}`;
      const created = await deps.persistence.createPlayer(handle, hashPlayerToken(playerToken));
      if (!created.ok) {
        return created;
      }
      return ok({ playerId: created.value.id, playerToken, handle });
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
      });
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
