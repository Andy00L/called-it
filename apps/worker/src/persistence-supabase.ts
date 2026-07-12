import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CallCategory, CallPredicate, MerkleProofStep } from '@calledit/contracts';
import { err, ok, type Result } from '@calledit/txline';
import {
  PERSISTENCE_ERROR_DUPLICATE_CATEGORY,
  PERSISTENCE_ERROR_NOT_PENDING,
  PERSISTENCE_ERROR_WALLET_TAKEN,
  type CommitmentRecord,
  type FixtureLeaderboardEntry,
  type LeaderboardEntry,
  type PersistencePort,
  type PickRecord,
  type PickStatus,
  type PlayerRecord,
  type SettledPickView,
  type SettlementInput,
} from './persistence.js';

/**
 * Supabase adapter. Uses the secret key (bypasses RLS), so it must only ever
 * run server-side. Schema source of truth: db/migrations/0001_init.sql.
 */

// Postgres unique_violation, raised by the picks_one_active_per_category
// partial unique index (sourceRef: db/migrations/0001_init.sql).
const POSTGRES_UNIQUE_VIOLATION = '23505';

interface PlayerRow {
  id: string;
  handle: string;
  token_hash: string;
  total_points: number;
  current_streak: number;
  best_streak: number;
  wallet_pubkey: string | null;
}

interface PickRow {
  id: string;
  player_id: string | null;
  fixture_id: number;
  option_id: string;
  category: CallCategory;
  claim: string;
  predicate: CallPredicate;
  probability_fraction: number;
  potential_points: number;
  pricing_source: 'market' | 'model';
  locked_at: string;
  lock_clock_seconds: number;
  is_bookie: boolean;
  bookie_of_pick_id: string | null;
  status: PickStatus;
  commitment_id: string | null;
  leaf_index: number | null;
  merkle_proof: MerkleProofStep[] | null;
}

interface CommitmentRow {
  id: string;
  root_hash: string;
  memo_tx_sig: string | null;
  pick_count: number;
  created_at: string;
}

function commitmentFromRow(row: CommitmentRow): CommitmentRecord {
  return {
    id: row.id,
    rootHashHex: row.root_hash,
    memoTxSig: row.memo_tx_sig,
    pickCount: row.pick_count,
    createdAtMs: Date.parse(row.created_at),
  };
}

interface SettlementRow {
  pick_id: string;
  outcome: 'hit' | 'miss';
  points_awarded: number;
  /** Absent until db/migrations/0003_near_miss.sql runs; reads use select *. */
  near_miss_seconds?: number | null;
}

function playerFromRow(row: PlayerRow): PlayerRecord {
  return {
    id: row.id,
    handle: row.handle,
    tokenHash: row.token_hash,
    totalPoints: row.total_points,
    currentStreak: row.current_streak,
    bestStreak: row.best_streak,
    walletPubkey: row.wallet_pubkey ?? null,
  };
}

function pickFromRow(row: PickRow): PickRecord {
  return {
    id: row.id,
    playerId: row.player_id,
    fixtureId: row.fixture_id,
    optionId: row.option_id,
    category: row.category,
    claim: row.claim,
    predicate: row.predicate,
    probabilityFraction: Number(row.probability_fraction),
    potentialPoints: row.potential_points,
    pricingSource: row.pricing_source,
    lockedAtMs: Date.parse(row.locked_at),
    lockClockSeconds: row.lock_clock_seconds,
    isBookie: row.is_bookie,
    bookieOfPickId: row.bookie_of_pick_id,
    status: row.status,
  };
}

/** Insert shape: commitment columns are filled later by the batcher. */
function pickToRow(pick: PickRecord): Omit<PickRow, 'commitment_id' | 'leaf_index' | 'merkle_proof'> {
  return {
    id: pick.id,
    player_id: pick.playerId,
    fixture_id: pick.fixtureId,
    option_id: pick.optionId,
    category: pick.category,
    claim: pick.claim,
    predicate: pick.predicate,
    probability_fraction: pick.probabilityFraction,
    potential_points: pick.potentialPoints,
    pricing_source: pick.pricingSource,
    locked_at: new Date(pick.lockedAtMs).toISOString(),
    lock_clock_seconds: pick.lockClockSeconds,
    is_bookie: pick.isBookie,
    bookie_of_pick_id: pick.bookieOfPickId,
    status: pick.status,
  };
}

/** Join settled picks with their settlement rows into calibration views. */
function buildSettledViews(
  pickRows: readonly PickRow[],
  settlementRows: readonly SettlementRow[],
): SettledPickView[] {
  const settlementsByPickId = new Map<string, SettlementRow>();
  for (const row of settlementRows) {
    settlementsByPickId.set(row.pick_id, row);
  }
  const views: SettledPickView[] = [];
  for (const pickRow of pickRows) {
    const settlement = settlementsByPickId.get(pickRow.id);
    if (settlement === undefined) {
      continue;
    }
    views.push({
      probabilityFraction: Number(pickRow.probability_fraction),
      outcome: settlement.outcome,
      pointsAwarded: settlement.points_awarded,
      fixtureId: pickRow.fixture_id,
    });
  }
  return views;
}

export function createSupabasePersistence(url: string, secretKey: string): PersistencePort {
  const client: SupabaseClient = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const fetchSettlements = async (
    pickIds: readonly string[],
  ): Promise<Result<SettlementRow[], string>> => {
    if (pickIds.length === 0) {
      return ok([]);
    }
    const { data, error } = await client
      .from('settlements')
      .select('pick_id, outcome, points_awarded')
      .in('pick_id', [...pickIds]);
    if (error !== null) {
      return err(`settlements select failed: ${error.message}`);
    }
    return ok((data ?? []) as SettlementRow[]);
  };

  return {
    describeBackend: () => 'supabase',

    createPlayer: async (handle, tokenHash) => {
      const { data, error } = await client
        .from('players')
        .insert({ handle, token_hash: tokenHash })
        .select()
        .single();
      if (error !== null) {
        return err(`players insert failed: ${error.message}`);
      }
      return ok(playerFromRow(data as PlayerRow));
    },

    getPlayer: async (playerId) => {
      const { data, error } = await client
        .from('players')
        .select('*')
        .eq('id', playerId)
        .maybeSingle();
      if (error !== null) {
        return err(`players select failed: ${error.message}`);
      }
      return ok(data === null ? null : playerFromRow(data as PlayerRow));
    },

    getPlayerByWallet: async (walletPubkey) => {
      const { data, error } = await client
        .from('players')
        .select('*')
        .eq('wallet_pubkey', walletPubkey)
        .maybeSingle();
      if (error !== null) {
        return err(`players by wallet select failed: ${error.message}`);
      }
      return ok(data === null ? null : playerFromRow(data as PlayerRow));
    },

    updatePlayerHandle: async (playerId, handle) => {
      const { error } = await client.from('players').update({ handle }).eq('id', playerId);
      if (error !== null) {
        return err(`players update failed: ${error.message}`);
      }
      return ok(undefined);
    },

    linkWallet: async (playerId, walletPubkey) => {
      const { error } = await client
        .from('players')
        .update({ wallet_pubkey: walletPubkey })
        .eq('id', playerId);
      if (error !== null) {
        if (error.code === POSTGRES_UNIQUE_VIOLATION) {
          return err(`${PERSISTENCE_ERROR_WALLET_TAKEN}: ${walletPubkey}`);
        }
        return err(`wallet link failed: ${error.message}`);
      }
      return ok(undefined);
    },

    rotatePlayerToken: async (playerId, tokenHash) => {
      const { error } = await client
        .from('players')
        .update({ token_hash: tokenHash })
        .eq('id', playerId);
      if (error !== null) {
        return err(`token rotate failed: ${error.message}`);
      }
      return ok(undefined);
    },

    insertPickPair: async (humanPick, bookiePick) => {
      const rows = [pickToRow(humanPick)];
      if (bookiePick !== null) {
        rows.push(pickToRow(bookiePick));
      }
      const { error } = await client.from('picks').insert(rows);
      if (error !== null) {
        if (error.code === POSTGRES_UNIQUE_VIOLATION) {
          return err(`${PERSISTENCE_ERROR_DUPLICATE_CATEGORY}: ${humanPick.category}`);
        }
        return err(`picks insert failed: ${error.message}`);
      }
      return ok(undefined);
    },

    listPendingPicks: async () => {
      const { data, error } = await client.from('picks').select('*').eq('status', 'pending');
      if (error !== null) {
        return err(`picks select failed: ${error.message}`);
      }
      return ok(((data ?? []) as PickRow[]).map(pickFromRow));
    },

    settlePick: async (input: SettlementInput) => {
      const { error } = await client.rpc('settle_pick', {
        p_pick_id: input.pickId,
        p_outcome: input.outcome,
        p_points_awarded: input.pointsAwarded,
        p_streak_multiplier: input.streakMultiplier,
        p_resolution_clock_seconds: input.resolutionClockSeconds,
        p_new_streak: input.newStreak,
      });
      if (error !== null) {
        if (error.message.includes('is not pending')) {
          return err(`${PERSISTENCE_ERROR_NOT_PENDING}: ${input.pickId}`);
        }
        return err(`settle_pick failed: ${error.message}`);
      }
      return ok(undefined);
    },

    leaderboardGlobal: async (limit) => {
      const { data, error } = await client.from('leaderboard_global').select('*').limit(limit);
      if (error !== null) {
        return err(`leaderboard_global select failed: ${error.message}`);
      }
      const rows = (data ?? []) as Array<Omit<PlayerRow, 'token_hash'>>;
      return ok(
        rows.map((row) => ({
          playerId: row.id,
          handle: row.handle,
          totalPoints: row.total_points,
          currentStreak: row.current_streak,
          bestStreak: row.best_streak,
        })),
      );
    },

    leaderboardFixture: async (fixtureId, limit) => {
      const { data, error } = await client
        .from('leaderboard_fixture')
        .select('*')
        .eq('fixture_id', fixtureId)
        .order('fixture_points', { ascending: false })
        .limit(limit);
      if (error !== null) {
        return err(`leaderboard_fixture select failed: ${error.message}`);
      }
      const rows = (data ?? []) as Array<{
        player_id: string;
        handle: string;
        fixture_points: number;
      }>;
      return ok(
        rows.map((row) => ({
          playerId: row.player_id,
          handle: row.handle,
          fixturePoints: row.fixture_points,
        })),
      );
    },

    listSettledPicksForPlayer: async (playerId) => {
      const { data, error } = await client
        .from('picks')
        .select('*')
        .eq('player_id', playerId)
        .eq('is_bookie', false)
        .neq('status', 'pending');
      if (error !== null) {
        return err(`picks select failed: ${error.message}`);
      }
      const pickRows = (data ?? []) as PickRow[];
      const settlements = await fetchSettlements(pickRows.map((row) => row.id));
      if (!settlements.ok) {
        return settlements;
      }
      return ok(buildSettledViews(pickRows, settlements.value));
    },

    listUncommittedPicks: async () => {
      const { data, error } = await client
        .from('picks')
        .select('*')
        .is('commitment_id', null)
        .order('locked_at', { ascending: true })
        .order('id', { ascending: true });
      if (error !== null) {
        return err(`uncommitted picks select failed: ${error.message}`);
      }
      return ok(((data ?? []) as PickRow[]).map(pickFromRow));
    },

    recordCommitment: async (commitment, assignments) => {
      const { error: insertError } = await client.from('commitments').insert({
        id: commitment.id,
        root_hash: commitment.rootHashHex,
        memo_tx_sig: commitment.memoTxSig,
        pick_count: commitment.pickCount,
        created_at: new Date(commitment.createdAtMs).toISOString(),
      });
      if (insertError !== null) {
        return err(`commitments insert failed: ${insertError.message}`);
      }
      // Per-pick proofs differ, so this is one update per pick; batches stay
      // small (picks locked in the last interval).
      for (const assignment of assignments) {
        const { error: updateError } = await client
          .from('picks')
          .update({
            commitment_id: commitment.id,
            leaf_index: assignment.leafIndex,
            merkle_proof: assignment.proof,
          })
          .eq('id', assignment.pickId);
        if (updateError !== null) {
          return err(`pick ${assignment.pickId} commitment update failed: ${updateError.message}`);
        }
      }
      return ok(undefined);
    },

    getReceipt: async (pickId) => {
      const pickResult = await client.from('picks').select('*').eq('id', pickId).maybeSingle();
      if (pickResult.error !== null) {
        return err(`receipt pick select failed: ${pickResult.error.message}`);
      }
      if (pickResult.data === null) {
        return ok(null);
      }
      const pickRow = pickResult.data as PickRow;

      // select * so the read works before AND after the 0003 near-miss column.
      const settlementResult = await client
        .from('settlements')
        .select('*')
        .eq('pick_id', pickId)
        .maybeSingle();
      if (settlementResult.error !== null) {
        return err(`receipt settlement select failed: ${settlementResult.error.message}`);
      }
      const settlementRow = settlementResult.data as SettlementRow | null;

      let commitment: CommitmentRecord | null = null;
      if (pickRow.commitment_id !== null) {
        const commitmentResult = await client
          .from('commitments')
          .select('*')
          .eq('id', pickRow.commitment_id)
          .maybeSingle();
        if (commitmentResult.error !== null) {
          return err(`receipt commitment select failed: ${commitmentResult.error.message}`);
        }
        commitment =
          commitmentResult.data === null
            ? null
            : commitmentFromRow(commitmentResult.data as CommitmentRow);
      }

      let playerHandle: string | null = null;
      if (pickRow.player_id !== null) {
        const playerResult = await client
          .from('players')
          .select('handle')
          .eq('id', pickRow.player_id)
          .maybeSingle();
        if (playerResult.error !== null) {
          return err(`receipt player select failed: ${playerResult.error.message}`);
        }
        playerHandle = (playerResult.data as { handle: string } | null)?.handle ?? null;
      }

      return ok({
        pick: pickFromRow(pickRow),
        playerHandle,
        settlement:
          settlementRow === null
            ? null
            : {
                outcome: settlementRow.outcome,
                pointsAwarded: settlementRow.points_awarded,
                nearMissSeconds: settlementRow.near_miss_seconds ?? null,
              },
        commitment,
        leafIndex: pickRow.leaf_index,
        proof: pickRow.merkle_proof,
      });
    },

    listPicksForPlayerFixture: async (playerId, fixtureId) => {
      const pickResult = await client
        .from('picks')
        .select('*')
        .eq('player_id', playerId)
        .eq('fixture_id', fixtureId)
        .eq('is_bookie', false)
        .order('locked_at', { ascending: true });
      if (pickResult.error !== null) {
        return err(`my picks select failed: ${pickResult.error.message}`);
      }
      const pickRows = (pickResult.data ?? []) as PickRow[];
      if (pickRows.length === 0) {
        return ok([]);
      }
      const pickIds = pickRows.map((row) => row.id);
      // select * so the read works before AND after the 0003 near-miss column.
      const settlementResult = await client
        .from('settlements')
        .select('*')
        .in('pick_id', pickIds);
      if (settlementResult.error !== null) {
        return err(`my picks settlements select failed: ${settlementResult.error.message}`);
      }
      const settlementsByPickId = new Map(
        ((settlementResult.data ?? []) as SettlementRow[]).map((row) => [row.pick_id, row]),
      );
      const mirrorResult = await client
        .from('picks')
        .select('bookie_of_pick_id, probability_fraction')
        .eq('is_bookie', true)
        .in('bookie_of_pick_id', pickIds);
      if (mirrorResult.error !== null) {
        return err(`my picks mirrors select failed: ${mirrorResult.error.message}`);
      }
      const mirrorRows = (mirrorResult.data ?? []) as Array<{
        bookie_of_pick_id: string | null;
        probability_fraction: number;
      }>;
      const mirrorProbabilityByHumanPickId = new Map<string, number>();
      for (const mirrorRow of mirrorRows) {
        if (mirrorRow.bookie_of_pick_id !== null) {
          mirrorProbabilityByHumanPickId.set(
            mirrorRow.bookie_of_pick_id,
            Number(mirrorRow.probability_fraction),
          );
        }
      }
      return ok(
        pickRows.map((row) => {
          const settlementRow = settlementsByPickId.get(row.id);
          return {
            pick: pickFromRow(row),
            settlement:
              settlementRow === undefined
                ? null
                : {
                    outcome: settlementRow.outcome,
                    pointsAwarded: settlementRow.points_awarded,
                    nearMissSeconds: settlementRow.near_miss_seconds ?? null,
                  },
            bookieProbability: mirrorProbabilityByHumanPickId.get(row.id) ?? null,
          };
        }),
      );
    },

    recordNearMiss: async (pickId, nearMissSeconds) => {
      const { error } = await client
        .from('settlements')
        .update({ near_miss_seconds: nearMissSeconds })
        .eq('pick_id', pickId);
      if (error !== null) {
        // Distinct message: before 0003 runs the column is missing; the game
        // service logs this and keeps going (the SSE notice still fires).
        return err(`near miss update failed (run 0003_near_miss.sql?): ${error.message}`);
      }
      return ok(undefined);
    },

    duelStats: async (sinceMs) => {
      const { data, error } = await client
        .from('picks')
        .select('is_bookie, status')
        .gte('locked_at', new Date(sinceMs).toISOString())
        .neq('status', 'pending');
      if (error !== null) {
        return err(`duel stats select failed: ${error.message}`);
      }
      const rows = (data ?? []) as Array<{ is_bookie: boolean; status: PickStatus }>;
      const stats = { sinceMs, humanSettled: 0, humanHits: 0, bookieSettled: 0, bookieHits: 0 };
      for (const row of rows) {
        if (row.is_bookie) {
          stats.bookieSettled += 1;
          stats.bookieHits += row.status === 'hit' ? 1 : 0;
        } else {
          stats.humanSettled += 1;
          stats.humanHits += row.status === 'hit' ? 1 : 0;
        }
      }
      return ok(stats);
    },

    listSettledBookiePicksAgainstPlayer: async (playerId) => {
      const humanPicks = await client
        .from('picks')
        .select('id')
        .eq('player_id', playerId)
        .eq('is_bookie', false);
      if (humanPicks.error !== null) {
        return err(`picks select failed: ${humanPicks.error.message}`);
      }
      const humanIds = ((humanPicks.data ?? []) as Array<{ id: string }>).map((row) => row.id);
      if (humanIds.length === 0) {
        return ok([]);
      }
      const ghostPicks = await client
        .from('picks')
        .select('*')
        .eq('is_bookie', true)
        .in('bookie_of_pick_id', humanIds)
        .neq('status', 'pending');
      if (ghostPicks.error !== null) {
        return err(`ghost picks select failed: ${ghostPicks.error.message}`);
      }
      const ghostRows = (ghostPicks.data ?? []) as PickRow[];
      const settlements = await fetchSettlements(ghostRows.map((row) => row.id));
      if (!settlements.ok) {
        return settlements;
      }
      return ok(buildSettledViews(ghostRows, settlements.value));
    },
  };
}
