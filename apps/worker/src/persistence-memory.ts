import { err, ok } from '@calledit/txline';
import {
  PERSISTENCE_ERROR_DUPLICATE_CATEGORY,
  PERSISTENCE_ERROR_NOT_PENDING,
  PERSISTENCE_ERROR_TERRACE_CODE_TAKEN,
  PERSISTENCE_ERROR_TX_USED,
  PERSISTENCE_ERROR_WALLET_TAKEN,
  type CommitmentRecord,
  type FixtureLeaderboardEntry,
  type FixturePointsEntry,
  type LeaderboardEntry,
  type PersistencePort,
  type PickRecord,
  type PlayerRecord,
  type SettledPickView,
  type SettlementInput,
  type SponsorRecord,
  type TerraceRecord,
} from './persistence.js';
import type { MerkleProofStep } from '@calledit/contracts';

/**
 * In-memory adapter: backs the test suite and keeps the worker fully
 * functional when Supabase credentials are absent (state lost on restart,
 * which main.ts logs loudly at boot).
 */

interface SettlementRow {
  pickId: string;
  outcome: 'hit' | 'miss';
  pointsAwarded: number;
  nearMissSeconds: number | null;
}

interface PickCommitmentLink {
  commitmentId: string;
  leafIndex: number;
  proof: MerkleProofStep[];
}

export function createMemoryPersistence(): PersistencePort {
  const players = new Map<string, PlayerRecord>();
  const picks = new Map<string, PickRecord>();
  const settlements = new Map<string, SettlementRow>();
  const commitments = new Map<string, CommitmentRecord>();
  const commitmentLinksByPickId = new Map<string, PickCommitmentLink>();
  const sponsors = new Map<string, SponsorRecord>();
  const terraces = new Map<string, TerraceRecord>();
  /** code -> member player ids; Set keeps join order (insertion order). */
  const terraceMembersByCode = new Map<string, Set<string>>();

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
        walletPubkey: null,
      };
      players.set(player.id, player);
      return ok(player);
    },

    getPlayer: async (playerId) => ok(players.get(playerId) ?? null),

    getPlayerByWallet: async (walletPubkey) => {
      for (const player of players.values()) {
        if (player.walletPubkey === walletPubkey) {
          return ok(player);
        }
      }
      return ok(null);
    },

    updatePlayerHandle: async (playerId, handle) => {
      const player = players.get(playerId);
      if (player === undefined) {
        return err(`players update failed: unknown player ${playerId}`);
      }
      player.handle = handle;
      return ok(undefined);
    },

    linkWallet: async (playerId, walletPubkey) => {
      const player = players.get(playerId);
      if (player === undefined) {
        return err(`players update failed: unknown player ${playerId}`);
      }
      for (const other of players.values()) {
        if (other.id !== playerId && other.walletPubkey === walletPubkey) {
          return err(`${PERSISTENCE_ERROR_WALLET_TAKEN}: ${walletPubkey}`);
        }
      }
      player.walletPubkey = walletPubkey;
      return ok(undefined);
    },

    rotatePlayerToken: async (playerId, tokenHash) => {
      const player = players.get(playerId);
      if (player === undefined) {
        return err(`players update failed: unknown player ${playerId}`);
      }
      player.tokenHash = tokenHash;
      return ok(undefined);
    },

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
        nearMissSeconds: null,
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

    listUncommittedPicks: async () =>
      ok(
        [...picks.values()]
          .filter((pick) => !commitmentLinksByPickId.has(pick.id))
          .sort((left, right) => left.lockedAtMs - right.lockedAtMs || left.id.localeCompare(right.id)),
      ),

    recordCommitment: async (commitment, assignments) => {
      commitments.set(commitment.id, { ...commitment });
      for (const assignment of assignments) {
        commitmentLinksByPickId.set(assignment.pickId, {
          commitmentId: commitment.id,
          leafIndex: assignment.leafIndex,
          proof: assignment.proof.map((step) => ({ ...step })),
        });
      }
      return ok(undefined);
    },

    getReceipt: async (pickId) => {
      const pick = picks.get(pickId);
      if (pick === undefined) {
        return ok(null);
      }
      const settlement = settlements.get(pickId);
      const link = commitmentLinksByPickId.get(pickId);
      const commitment = link === undefined ? undefined : commitments.get(link.commitmentId);
      const player = pick.playerId === null ? undefined : players.get(pick.playerId);
      return ok({
        pick: { ...pick },
        playerHandle: player?.handle ?? null,
        settlement:
          settlement === undefined
            ? null
            : {
                outcome: settlement.outcome,
                pointsAwarded: settlement.pointsAwarded,
                nearMissSeconds: settlement.nearMissSeconds,
              },
        commitment: commitment === undefined ? null : { ...commitment },
        leafIndex: link?.leafIndex ?? null,
        proof: link?.proof ?? null,
      });
    },

    listPicksForPlayerFixture: async (playerId, fixtureId) => {
      const mirrorProbabilityByHumanPickId = new Map<string, number>();
      for (const pick of picks.values()) {
        if (pick.isBookie && pick.bookieOfPickId !== null) {
          mirrorProbabilityByHumanPickId.set(pick.bookieOfPickId, pick.probabilityFraction);
        }
      }
      return ok(
        [...picks.values()]
          .filter(
            (pick) =>
              !pick.isBookie && pick.playerId === playerId && pick.fixtureId === fixtureId,
          )
          .sort((left, right) => left.lockedAtMs - right.lockedAtMs)
          .map((pick) => {
            const settlement = settlements.get(pick.id);
            return {
              pick: { ...pick },
              settlement:
                settlement === undefined
                  ? null
                  : {
                      outcome: settlement.outcome,
                      pointsAwarded: settlement.pointsAwarded,
                      nearMissSeconds: settlement.nearMissSeconds,
                    },
              bookieProbability: mirrorProbabilityByHumanPickId.get(pick.id) ?? null,
            };
          }),
      );
    },

    recordNearMiss: async (pickId, nearMissSeconds) => {
      const settlement = settlements.get(pickId);
      if (settlement === undefined) {
        return err(`near miss update failed: pick ${pickId} has no settlement`);
      }
      settlement.nearMissSeconds = nearMissSeconds;
      return ok(undefined);
    },

    createSponsorIntent: async (record) => {
      sponsors.set(record.id, { ...record });
      return ok(undefined);
    },

    getSponsor: async (sponsorId) => {
      const record = sponsors.get(sponsorId);
      return ok(record === undefined ? null : { ...record });
    },

    activateSponsor: async (input) => {
      const record = sponsors.get(input.id);
      if (record === undefined || record.status !== 'pending') {
        return err(`${PERSISTENCE_ERROR_NOT_PENDING}: sponsor ${input.id}`);
      }
      for (const other of sponsors.values()) {
        if (other.id !== input.id && other.txSig === input.txSig) {
          return err(`${PERSISTENCE_ERROR_TX_USED}: ${input.txSig}`);
        }
      }
      record.status = 'active';
      record.txSig = input.txSig;
      record.payerPubkey = input.payerPubkey;
      record.paidLamports = input.paidLamports;
      record.startsAtMs = input.startsAtMs;
      record.endsAtMs = input.endsAtMs;
      return ok(undefined);
    },

    listActiveSponsors: async (nowMs) =>
      ok(
        [...sponsors.values()]
          .filter(
            (record) =>
              record.status === 'active' &&
              record.endsAtMs !== null &&
              record.endsAtMs > nowMs,
          )
          .sort(
            (left, right) =>
              right.weight - left.weight || (left.endsAtMs ?? 0) - (right.endsAtMs ?? 0),
          )
          .map((record) => ({ ...record })),
      ),

    duelStats: async (sinceMs) => {
      const stats = {
        sinceMs,
        humanSettled: 0,
        humanHits: 0,
        bookieSettled: 0,
        bookieHits: 0,
      };
      for (const pick of picks.values()) {
        if (pick.lockedAtMs < sinceMs || pick.status === 'pending') {
          continue;
        }
        if (pick.isBookie) {
          stats.bookieSettled += 1;
          stats.bookieHits += pick.status === 'hit' ? 1 : 0;
        } else {
          stats.humanSettled += 1;
          stats.humanHits += pick.status === 'hit' ? 1 : 0;
        }
      }
      return ok(stats);
    },

    createTerrace: async (record) => {
      if (terraces.has(record.code)) {
        return err(`${PERSISTENCE_ERROR_TERRACE_CODE_TAKEN}: ${record.code}`);
      }
      terraces.set(record.code, { ...record });
      return ok(undefined);
    },

    getTerrace: async (code) => {
      const record = terraces.get(code);
      return ok(record === undefined ? null : { ...record });
    },

    addTerraceMember: async (code, playerId) => {
      if (!terraces.has(code)) {
        return err(`terrace member insert failed: unknown terrace ${code}`);
      }
      const members = terraceMembersByCode.get(code) ?? new Set<string>();
      members.add(playerId);
      terraceMembersByCode.set(code, members);
      return ok(undefined);
    },

    removeTerraceMember: async (code, playerId) => {
      terraceMembersByCode.get(code)?.delete(playerId);
      return ok(undefined);
    },

    listTerraceMembers: async (code) => {
      const members = terraceMembersByCode.get(code) ?? new Set<string>();
      return ok(
        [...members].map((playerId) => ({
          playerId,
          handle: players.get(playerId)?.handle ?? 'unknown',
        })),
      );
    },

    fixturePointsForPlayers: async (fixtureId, playerIds) => {
      const wantedIds = new Set(playerIds);
      const totalsByPlayerId = new Map<string, number>();
      for (const pick of picks.values()) {
        if (
          pick.isBookie ||
          pick.fixtureId !== fixtureId ||
          pick.playerId === null ||
          !wantedIds.has(pick.playerId)
        ) {
          continue;
        }
        const view = settledViewOf(pick);
        if (view === null) {
          continue;
        }
        totalsByPlayerId.set(
          pick.playerId,
          (totalsByPlayerId.get(pick.playerId) ?? 0) + view.pointsAwarded,
        );
      }
      const entries: FixturePointsEntry[] = [...totalsByPlayerId].map(
        ([playerId, fixturePoints]) => ({ playerId, fixturePoints }),
      );
      return ok(entries);
    },

    bookieFixturePointsAgainstPlayers: async (fixtureId, playerIds) => {
      const wantedIds = new Set(playerIds);
      const memberPickIds = new Set<string>();
      for (const pick of picks.values()) {
        if (
          !pick.isBookie &&
          pick.fixtureId === fixtureId &&
          pick.playerId !== null &&
          wantedIds.has(pick.playerId)
        ) {
          memberPickIds.add(pick.id);
        }
      }
      let bookiePoints = 0;
      for (const pick of picks.values()) {
        if (
          !pick.isBookie ||
          pick.bookieOfPickId === null ||
          !memberPickIds.has(pick.bookieOfPickId)
        ) {
          continue;
        }
        const view = settledViewOf(pick);
        if (view !== null) {
          bookiePoints += view.pointsAwarded;
        }
      }
      return ok(bookiePoints);
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
