import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { CallCategory, CallPredicate } from '@calledit/engine';
import { err, ok, type Result } from '@calledit/txline';
import {
  PERSISTENCE_ERROR_DUPLICATE_CATEGORY,
  PERSISTENCE_ERROR_NOT_PENDING,
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
}

interface SettlementRow {
  pick_id: string;
  outcome: 'hit' | 'miss';
  points_awarded: number;
}

function playerFromRow(row: PlayerRow): PlayerRecord {
  return {
    id: row.id,
    handle: row.handle,
    tokenHash: row.token_hash,
    totalPoints: row.total_points,
    currentStreak: row.current_streak,
    bestStreak: row.best_streak,
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

function pickToRow(pick: PickRecord): PickRow {
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
