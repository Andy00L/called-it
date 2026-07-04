import { err, ok, type Result } from '@calledit/txline';
import {
  PERSISTENCE_ERROR_DUPLICATE_CATEGORY,
  PERSISTENCE_ERROR_NOT_PENDING,
  type FixtureLeaderboardEntry,
  type LeaderboardEntry,
  type PersistencePort,
  type PickRecord,
  type PlayerRecord,
  type SettledPickView,
  type SettlementInput,
} from './persistence.js';

/**
 * In-memory adapter: backs the test suite and keeps the worker fully
 * functional when Supabase credentials are absent (state lost on restart,
 * which main.ts logs loudly at boot).
 */

interface SettlementRow {
  pickId: string;
  outcome: 'hit' | 'miss';
  pointsAwarded: number;
}

export function createMemoryPersistence(): PersistencePort {
  const players = new Map<string, PlayerRecord>();
  const picks = new Map<string, PickRecord>();
  const settlements = new Map<string, SettlementRow>();

  const hasPendingInCategory = (candidate: PickRecord): boolean => {
    for (const existing of picks.values()) {
      if (
        !existing.isBookie &&
        existing.status === 'pending' &&
        existing.playerId === candidate.playerId &&
        existing.fixtureId === candidate.fixtureId &&
        existing.category === candidate.category
      ) {
        return true;
      }
    }
    return false;
  };

  const settledViewOf = (pick: PickRecord): SettledPickView | null => {
    const settlement = settlements.get(pick.id);
    if (settlement === undefined) {
      return null;
    }
    return {
      probabilityFraction: pick.probabilityFraction,
      outcome: settlement.outcome,
      pointsAwarded: settlement.pointsAwarded,
      fixtureId: pick.fixtureId,
    };
  };

  return {
    describeBackend: () => 'memory (non-durable)',

    createPlayer: async (handle, tokenHash) => {
      const player: PlayerRecord = {
        id: crypto.randomUUID(),
        handle,
        tokenHash,
        totalPoints: 0,
        currentStreak: 0,
        bestStreak: 0,
      };
      players.set(player.id, player);
      return ok(player);
    },

    getPlayer: async (playerId) => ok(players.get(playerId) ?? null),

    insertPickPair: async (humanPick, bookiePick) => {
      if (hasPendingInCategory(humanPick)) {
        return err(`${PERSISTENCE_ERROR_DUPLICATE_CATEGORY}: ${humanPick.category}`);
      }
      picks.set(humanPick.id, { ...humanPick });
      if (bookiePick !== null) {
        picks.set(bookiePick.id, { ...bookiePick });
      }
      return ok(undefined);
    },

    listPendingPicks: async () =>
      ok([...picks.values()].filter((pick) => pick.status === 'pending')),

    settlePick: async (input: SettlementInput) => {
      const pick = picks.get(input.pickId);
      if (pick === undefined || pick.status !== 'pending') {
        return err(`${PERSISTENCE_ERROR_NOT_PENDING}: ${input.pickId}`);
      }
      pick.status = input.outcome;
      settlements.set(pick.id, {
        pickId: pick.id,
        outcome: input.outcome,
        pointsAwarded: input.pointsAwarded,
      });
      if (input.playerId !== null) {
        const player = players.get(input.playerId);
        if (player !== undefined) {
          player.totalPoints += input.pointsAwarded;
          player.currentStreak = input.newStreak;
          player.bestStreak = Math.max(player.bestStreak, input.newStreak);
        }
      }
      return ok(undefined);
    },

    leaderboardGlobal: async (limit) =>
      ok(
        [...players.values()]
          .sort((left, right) => right.totalPoints - left.totalPoints)
          .slice(0, limit)
          .map((player) => ({
            playerId: player.id,
            handle: player.handle,
            totalPoints: player.totalPoints,
            currentStreak: player.currentStreak,
            bestStreak: player.bestStreak,
          })),
      ),

    leaderboardFixture: async (fixtureId, limit) => {
      const totals = new Map<string, FixtureLeaderboardEntry>();
      for (const pick of picks.values()) {
        if (pick.isBookie || pick.fixtureId !== fixtureId || pick.playerId === null) {
          continue;
        }
        const view = settledViewOf(pick);
        if (view === null) {
          continue;
        }
        const player = players.get(pick.playerId);
        const entry = totals.get(pick.playerId) ?? {
          playerId: pick.playerId,
          handle: player?.handle ?? 'unknown',
          fixturePoints: 0,
        };
        entry.fixturePoints += view.pointsAwarded;
        totals.set(pick.playerId, entry);
      }
      return ok(
        [...totals.values()]
          .sort((left, right) => right.fixturePoints - left.fixturePoints)
          .slice(0, limit),
      );
    },

    listSettledPicksForPlayer: async (playerId) => {
      const views: SettledPickView[] = [];
      for (const pick of picks.values()) {
        if (pick.isBookie || pick.playerId !== playerId) {
          continue;
        }
        const view = settledViewOf(pick);
        if (view !== null) {
          views.push(view);
        }
      }
      return ok(views);
    },

    listSettledBookiePicksAgainstPlayer: async (playerId) => {
      const humanPickIds = new Set<string>();
      for (const pick of picks.values()) {
        if (!pick.isBookie && pick.playerId === playerId) {
          humanPickIds.add(pick.id);
        }
      }
      const views: SettledPickView[] = [];
      for (const pick of picks.values()) {
        if (!pick.isBookie || pick.bookieOfPickId === null) {
          continue;
        }
        if (!humanPickIds.has(pick.bookieOfPickId)) {
          continue;
        }
        const view = settledViewOf(pick);
        if (view !== null) {
          views.push(view);
        }
      }
      return ok(views);
    },
  };
}
