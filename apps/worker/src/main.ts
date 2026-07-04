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
import { createFanout } from './fanout.js';
import { runIngest } from './ingest.js';
import { readWorkerEnv } from './env.js';

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

function main(): void {
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

  const fanout = createFanout({
    buildLivePayload,
    buildStatePayload: (fixtureId) => getMatchState(store, fixtureId) ?? null,
    buildHealthPayload: () => ({
      ok: true,
      network: env.cfg.network,
      uptimeSeconds: Math.round((Date.now() - startedAtMs) / 1000),
      fixturesTracked: listMatchStates(store).length,
      sseClients: fanout.clientCount(),
      lastHeartbeatMs,
      latency: { scores: snapshotLatency(scoresLatency), odds: snapshotLatency(oddsLatency) },
    }),
  });

  const abortController = new AbortController();

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

main();
