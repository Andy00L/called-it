import type { IncomingMessage } from 'node:http';
import {
  generateCalls,
  pickBookieDeck,
  type CallOption,
  type MatchEvent,
  type MatchResultProbabilities,
} from '@calledit/engine';
import { appendTapeEntry, openTapeDeck } from './tape.js';
import {
  createLatencyTracker,
  recordLatency,
  snapshotLatency,
  type LatencySnapshot,
} from './latency.js';
import {
  applyOddsPayload,
  applyScoresUpdate,
  createMatchStateStore,
  getMatchState,
  isInRunning,
  listMatchStates,
  type MatchPhase,
} from './state.js';
import { createFanout, type ApiResult } from './fanout.js';
import { runIngest } from './ingest.js';
import { readWorkerEnv } from './env.js';
import { createGameService, type GameService } from './game.js';
import { createMemoryPersistence } from './persistence-memory.js';
import { createSupabasePersistence } from './persistence-supabase.js';

// Events included in live payloads; the full timeline stays in the tape.
const LIVE_PAYLOAD_EVENT_LIMIT = 50;

/** Shape served on /live/:fixtureId and consumed by the web app. */
export interface LivePayload {
  fixtureId: number;
  phase: MatchPhase;
  clockSeconds: number;
  clockRunning: boolean;
  score: unknown;
  matchResult: MatchResultProbabilities | null;
  eventCount: number;
  recentEvents: MatchEvent[];
  catalog: CallOption[];
  bookieDeck: CallOption[];
  latency: { scores: LatencySnapshot | null; odds: LatencySnapshot | null };
  updatedAtMs: number;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function asRecord(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
}

/** Map game-service error codes onto HTTP statuses (distinct per failure mode). */
function statusForGameError(code: string): number {
  if (code === 'auth_failed') {
    return 401;
  }
  if (code === 'unknown_fixture' || code === 'unknown_option' || code === 'unknown_player') {
    return 404;
  }
  if (code === 'duplicate_category' || code === 'not_in_running' || code === 'window_too_short') {
    return 409;
  }
  if (code.startsWith('invalid_')) {
    return 400;
  }
  return 500;
}

function buildApiHandler(game: GameService) {
  return async (
    method: string,
    segments: string[],
    body: unknown,
    headers: IncomingMessage['headers'],
  ): Promise<ApiResult | null> => {
    if (method === 'POST' && segments.length === 2 && segments[0] === 'players' && segments[1] === 'guest') {
      const created = await game.createGuestPlayer(asRecord(body)['handle']);
      if (!created.ok) {
        return { status: statusForGameError(created.error), body: { error: created.error } };
      }
      return { status: 200, body: created.value };
    }

    if (method === 'POST' && segments.length === 1 && segments[0] === 'picks') {
      const bodyRecord = asRecord(body);
      const locked = await game.lockPick(
        firstHeaderValue(headers['x-player-id']),
        firstHeaderValue(headers['x-player-token']),
        bodyRecord['fixtureId'],
        bodyRecord['optionId'],
      );
      if (!locked.ok) {
        return { status: statusForGameError(locked.error), body: { error: locked.error } };
      }
      return { status: 200, body: locked.value };
    }

    if (method === 'GET' && segments.length === 1 && segments[0] === 'leaderboard') {
      const rows = await game.leaderboardGlobal();
      if (!rows.ok) {
        return { status: 500, body: { error: rows.error } };
      }
      return { status: 200, body: rows.value };
    }

    if (method === 'GET' && segments.length === 2 && segments[0] === 'leaderboard') {
      const fixtureId = Number.parseInt(segments[1] ?? '', 10);
      if (!Number.isInteger(fixtureId) || fixtureId <= 0) {
        return { status: 400, body: { error: 'fixtureId must be a positive integer' } };
      }
      const rows = await game.leaderboardFixture(fixtureId);
      if (!rows.ok) {
        return { status: 500, body: { error: rows.error } };
      }
      return { status: 200, body: rows.value };
    }

    if (method === 'GET' && segments.length === 2 && segments[0] === 'profile') {
      const profile = await game.profile(segments[1]);
      if (!profile.ok) {
        return { status: statusForGameError(profile.error), body: { error: profile.error } };
      }
      return { status: 200, body: profile.value };
    }

    return null;
  };
}

async function main(): Promise<void> {
  const envResult = readWorkerEnv();
  if (!envResult.ok) {
    console.error(`[main] ${envResult.error}`);
    process.exitCode = 1;
    return;
  }
  const env = envResult.value;

  const deckResult = openTapeDeck(env.tapesDirectory);
  if (!deckResult.ok) {
    console.error(`[main] ${deckResult.error}`);
    process.exitCode = 1;
    return;
  }
  const tapeDeck = deckResult.value;

  const persistence =
    env.supabaseUrl !== undefined && env.supabaseSecretKey !== undefined
      ? createSupabasePersistence(env.supabaseUrl, env.supabaseSecretKey)
      : createMemoryPersistence();
  console.log(`[main] persistence backend: ${persistence.describeBackend()}`);
  if (persistence.describeBackend().startsWith('memory')) {
    console.warn('[main] SUPABASE_URL/SUPABASE_SECRET_KEY missing: picks are NOT durable');
  }

  const store = createMatchStateStore();
  const scoresLatency = createLatencyTracker();
  const oddsLatency = createLatencyTracker();
  const startedAtMs = Date.now();
  const lastHeartbeatMs: Record<'scores' | 'odds', number> = { scores: 0, odds: 0 };

  const buildLivePayload = (fixtureId: number): LivePayload | null => {
    const state = getMatchState(store, fixtureId);
    if (state === undefined) {
      return null;
    }
    const catalog = generateCalls({
      clockSeconds: state.clockSeconds,
      score: state.score,
      matchResult: state.matchResult,
      inRunning: isInRunning(state),
    });
    return {
      fixtureId: state.fixtureId,
      phase: state.phase,
      clockSeconds: state.clockSeconds,
      clockRunning: state.clockRunning,
      score: state.score,
      matchResult: state.matchResult,
      eventCount: state.events.length,
      recentEvents: state.events.slice(-LIVE_PAYLOAD_EVENT_LIMIT),
      catalog,
      bookieDeck: pickBookieDeck(catalog),
      latency: { scores: snapshotLatency(scoresLatency), odds: snapshotLatency(oddsLatency) },
      updatedAtMs: state.updatedAtMs,
    };
  };

  const game = createGameService({
    persistence,
    store,
    onSettlement: (notice) => {
      fanout.broadcastEvent(notice.fixtureId, 'settlement', notice);
    },
  });

  const fanout = createFanout({
    buildLivePayload,
    buildStatePayload: (fixtureId) => getMatchState(store, fixtureId) ?? null,
    buildHealthPayload: () => ({
      ok: true,
      network: env.cfg.network,
      persistence: persistence.describeBackend(),
      uptimeSeconds: Math.round((Date.now() - startedAtMs) / 1000),
      fixturesTracked: listMatchStates(store).length,
      pendingPicks: game.pendingPickCount(),
      sseClients: fanout.clientCount(),
      lastHeartbeatMs,
      latency: { scores: snapshotLatency(scoresLatency), odds: snapshotLatency(oddsLatency) },
    }),
    handleApiRequest: buildApiHandler(game),
  });

  await game.hydratePendingPicks();

  const abortController = new AbortController();

  const triggerResolution = (fixtureId: number): void => {
    game.resolveFixture(fixtureId).catch((cause: unknown) => {
      const messageText = cause instanceof Error ? cause.message : String(cause);
      console.error(`[triggerResolution] fixture ${fixtureId}: ${messageText}`);
    });
  };

  const ingestPromise = runIngest(
    env.cfg,
    { jwt: env.jwt, apiToken: env.apiToken },
    {
      onScoresUpdate: (update, receivedAtMs) => {
        const taped = appendTapeEntry(tapeDeck, update.FixtureId, {
          receivedAtMs,
          stream: 'scores',
          payload: update,
        });
        if (!taped.ok) {
          console.error(`[onScoresUpdate] ${taped.error}`);
        }
        recordLatency(scoresLatency, update.Ts, receivedAtMs);
        const state = applyScoresUpdate(store, update, receivedAtMs);
        triggerResolution(state.fixtureId);
        fanout.broadcast(state.fixtureId);
      },
      onOddsPayload: (payload, receivedAtMs) => {
        const taped = appendTapeEntry(tapeDeck, payload.FixtureId, {
          receivedAtMs,
          stream: 'odds',
          payload,
        });
        if (!taped.ok) {
          console.error(`[onOddsPayload] ${taped.error}`);
        }
        recordLatency(oddsLatency, payload.Ts, receivedAtMs);
        const state = applyOddsPayload(store, payload, receivedAtMs);
        triggerResolution(state.fixtureId);
        fanout.broadcast(state.fixtureId);
      },
      onHeartbeat: (stream, receivedAtMs) => {
        lastHeartbeatMs[stream] = receivedAtMs;
      },
    },
    abortController.signal,
  );

  fanout.server.listen(env.port, () => {
    console.log(
      `[main] worker up: network=${env.cfg.network} port=${env.port} tapes=${env.tapesDirectory}`,
    );
  });

  const shutdown = (signalName: string): void => {
    console.log(`[shutdown] ${signalName} received, stopping`);
    abortController.abort();
    fanout.close();
    void ingestPromise.then(() => {
      console.log('[shutdown] ingest stopped, bye');
    });
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

void main();
