import { randomUUID } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { err, ok, type Result } from '@calledit/txline';
import type { OddsPayload, ScoresUpdate } from '@calledit/txline';
import type {
  LivePayload,
  LockResult,
  ProfilePayload,
  ReplayCreateResult,
  ReplaySessionInfo,
  ReplayTapeSummary,
  SettlementNotice,
} from '@calledit/contracts';
import type { Fixture } from '@calledit/txline';
import { readTape, tapeFilePath, type TapeDeck, type TapeEntry } from './tape.js';
import {
  applyOddsPayload,
  applyScoresUpdate,
  createMatchStateStore,
  getMatchState,
  type MatchStateStore,
} from './state.js';
import { createGameService, type GameService } from './game.js';
import { createMemoryPersistence } from './persistence-memory.js';
import { createLatencyTracker, recordLatency, type LatencyTracker } from './latency.js';
import { buildLivePayloadForState } from './live-payload.js';

/**
 * Time Machine: replay a finished match from its tape as if it were live.
 * Each session runs the SAME reducers and game service as the live path, but
 * against a private state store and an in-memory persistence, so replay picks
 * never touch Supabase, never enter the commitment batcher, and never move
 * the official leaderboard. The session owns one hidden guest player; the
 * client locks picks through the session, not through the global game API.
 */

// Speeds offered by the product (1x broadcast feel, 10x highlights, 60x demo).
const REPLAY_SPEEDS = [1, 10, 60] as const;

// Concurrency cap: each session holds a full match state plus a timer chain;
// the Railway box is small (product choice, revisit with real usage).
const MAX_ACTIVE_SESSIONS = 6;

// Delay clamps between applied tape entries. The floor keeps a burst of
// frames from flooding SSE clients; the ceiling compresses dead air (half
// time is 15 real minutes of nothing even at 1x).
const MIN_STEP_DELAY_MS = 15;
const MAX_STEP_DELAY_MS = 10000;

// A session dies this long after its last activity (applied entry or API
// touch), finished or not; a sweep runs on a fixed cadence.
const SESSION_IDLE_TTL_MS = 30 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

// Tapes smaller than this are connection stubs, not replayable matches.
const MIN_TAPE_BYTES = 2048;

// Tape file naming, mirrored from tape.ts (fixture-<id>.ndjson).
const TAPE_FILE_PATTERN = /^fixture-(\d+)\.ndjson$/;

/** Scheduler seam: production uses timers, tests drive steps synchronously. */
export interface ReplayScheduler {
  schedule(run: () => void, delayMs: number): () => void;
}

const TIMER_SCHEDULER: ReplayScheduler = {
  schedule: (run, delayMs) => {
    const timer = setTimeout(run, delayMs);
    return () => clearTimeout(timer);
  },
};

interface ReplaySession {
  id: string;
  fixtureId: number;
  speed: number;
  startedAtMs: number;
  store: MatchStateStore;
  game: GameService;
  guestPlayerId: string;
  guestPlayerToken: string;
  scoresLatency: LatencyTracker;
  oddsLatency: LatencyTracker;
  entries: TapeEntry[];
  cursor: number;
  skippedEntryCount: number;
  finished: boolean;
  lastActivityMs: number;
  cancelStep: (() => void) | null;
}

export interface ReplayManagerDeps {
  deck: TapeDeck;
  listFixtures(): Fixture[];
  /** True while the LIVE pipeline still tracks this fixture as unfinished. */
  isFixtureLive(fixtureId: number): boolean;
  onState(sessionId: string): void;
  onSettlement(sessionId: string, notice: SettlementNotice): void;
  scheduler?: ReplayScheduler;
  nowMs?: () => number;
}

export interface ReplayManager {
  listTapes(): Result<ReplayTapeSummary[], string>;
  createSession(rawFixtureId: unknown, rawSpeed: unknown): Promise<Result<ReplayCreateResult, string>>;
  sessionInfo(sessionId: string): Result<ReplaySessionInfo, string>;
  setSpeed(sessionId: string, rawSpeed: unknown): Result<ReplaySessionInfo, string>;
  lockPick(sessionId: string, rawOptionId: unknown): Promise<Result<LockResult, string>>;
  profile(sessionId: string): Promise<Result<ProfilePayload, string>>;
  /** Frame for the replay SSE channel; null before the first applied entry. */
  buildPayload(sessionId: string): LivePayload | null;
  hasSession(sessionId: string): boolean;
  activeSessionCount(): number;
  stopAll(): void;
}

/** Minimal structural check before trusting a tape line as a stream record. */
function isStreamRecord(payload: unknown): payload is { FixtureId: number; Ts: number } {
  if (typeof payload !== 'object' || payload === null) {
    return false;
  }
  const record = payload as Record<string, unknown>;
  return typeof record['FixtureId'] === 'number' && typeof record['Ts'] === 'number';
}

function parseSpeed(rawSpeed: unknown): number | null {
  const speed = typeof rawSpeed === 'number' ? rawSpeed : Number.parseInt(String(rawSpeed), 10);
  return (REPLAY_SPEEDS as readonly number[]).includes(speed) ? speed : null;
}

export function createReplayManager(deps: ReplayManagerDeps): ReplayManager {
  const nowMs = deps.nowMs ?? Date.now;
  const scheduler = deps.scheduler ?? TIMER_SCHEDULER;
  const sessions = new Map<string, ReplaySession>();
  let sweepTimer: NodeJS.Timeout | null = null;

  const describeSession = (session: ReplaySession): ReplaySessionInfo => ({
    sessionId: session.id,
    fixtureId: session.fixtureId,
    speed: session.speed,
    startedAtMs: session.startedAtMs,
    finished: session.finished,
    appliedEntries: session.cursor,
    totalEntries: session.entries.length,
  });

  const destroySession = (session: ReplaySession): void => {
    session.cancelStep?.();
    session.cancelStep = null;
    sessions.delete(session.id);
    if (sessions.size === 0 && sweepTimer !== null) {
      clearInterval(sweepTimer);
      sweepTimer = null;
    }
  };

  const sweepIdleSessions = (): void => {
    const cutoffMs = nowMs() - SESSION_IDLE_TTL_MS;
    for (const session of [...sessions.values()]) {
      if (session.lastActivityMs < cutoffMs) {
        console.log(`[sweepIdleSessions] replay ${session.id} idle, removing`);
        destroySession(session);
      }
    }
  };

  const ensureSweepRunning = (): void => {
    if (sweepTimer === null) {
      sweepTimer = setInterval(sweepIdleSessions, SWEEP_INTERVAL_MS);
      // The sweep must never keep the process alive on its own.
      sweepTimer.unref();
    }
  };

  /** Apply the entry under the cursor; advance; return the delay to the next step. */
  const applyNextEntry = async (session: ReplaySession): Promise<number | null> => {
    const entry = session.entries[session.cursor];
    if (entry === undefined) {
      return null;
    }
    session.cursor += 1;
    session.lastActivityMs = nowMs();

    if (isStreamRecord(entry.payload)) {
      if (entry.stream === 'scores') {
        const update = entry.payload as ScoresUpdate;
        // Latency shown in replay is the HISTORICAL feed latency: original
        // emit Ts versus original arrival, not anything about the replay.
        recordLatency(session.scoresLatency, update.Ts, entry.receivedAtMs);
        applyScoresUpdate(session.store, update, nowMs());
      } else {
        const payload = entry.payload as OddsPayload;
        recordLatency(session.oddsLatency, payload.Ts, entry.receivedAtMs);
        applyOddsPayload(session.store, payload, nowMs());
      }
      await session.game.resolveFixture(session.fixtureId);
      deps.onState(session.id);
    } else {
      session.skippedEntryCount += 1;
    }

    const nextEntry = session.entries[session.cursor];
    if (nextEntry === undefined) {
      return null;
    }
    const originalGapMs = Math.max(0, nextEntry.receivedAtMs - entry.receivedAtMs);
    return Math.min(MAX_STEP_DELAY_MS, Math.max(MIN_STEP_DELAY_MS, originalGapMs / session.speed));
  };

  /** End of tape: force final verdicts so no replay pick stays pending. */
  const finishSession = async (session: ReplaySession): Promise<void> => {
    const state = getMatchState(session.store, session.fixtureId);
    if (state !== undefined && state.phase !== 'finished') {
      // Truncated tape (recorder stopped early): the replay ends where the
      // tape ends; open windows resolve against what was actually recorded.
      state.phase = 'finished';
      await session.game.resolveFixture(session.fixtureId);
    }
    session.finished = true;
    session.lastActivityMs = nowMs();
    deps.onState(session.id);
    if (session.skippedEntryCount > 0) {
      console.warn(
        `[finishSession] replay ${session.id}: ${session.skippedEntryCount} malformed tape entries skipped`,
      );
    }
    console.log(
      `[finishSession] replay ${session.id} done: ${session.cursor}/${session.entries.length} entries`,
    );
  };

  const scheduleNextStep = (session: ReplaySession, delayMs: number): void => {
    session.cancelStep = scheduler.schedule(() => {
      session.cancelStep = null;
      void runStep(session);
    }, delayMs);
  };

  const runStep = async (session: ReplaySession): Promise<void> => {
    if (!sessions.has(session.id)) {
      return;
    }
    try {
      const nextDelayMs = await applyNextEntry(session);
      if (nextDelayMs === null) {
        await finishSession(session);
        return;
      }
      scheduleNextStep(session, nextDelayMs);
    } catch (cause) {
      const messageText = cause instanceof Error ? cause.message : String(cause);
      console.error(`[runStep] replay ${session.id}: ${messageText}`);
      await finishSession(session);
    }
  };

  return {
    listTapes: () => {
      let fileNames: string[];
      try {
        fileNames = readdirSync(deps.deck.directory);
      } catch (cause) {
        const messageText = cause instanceof Error ? cause.message : String(cause);
        return err(`listTapes: cannot read ${deps.deck.directory}: ${messageText}`);
      }
      const fixturesById = new Map(
        deps.listFixtures().map((fixture) => [fixture.FixtureId, fixture]),
      );
      const summaries: ReplayTapeSummary[] = [];
      for (const fileName of fileNames) {
        const match = TAPE_FILE_PATTERN.exec(fileName);
        if (match === null) {
          continue;
        }
        const fixtureId = Number.parseInt(match[1] ?? '', 10);
        if (!Number.isInteger(fixtureId) || fixtureId <= 0) {
          continue;
        }
        let sizeBytes = 0;
        let updatedAtMs = 0;
        try {
          const stats = statSync(resolve(deps.deck.directory, fileName));
          sizeBytes = stats.size;
          updatedAtMs = stats.mtimeMs;
        } catch {
          continue;
        }
        if (sizeBytes < MIN_TAPE_BYTES) {
          continue;
        }
        // A tape still being written belongs to a live match: not replayable yet.
        if (deps.isFixtureLive(fixtureId)) {
          continue;
        }
        const fixture = fixturesById.get(fixtureId);
        summaries.push({
          fixtureId,
          competition: fixture?.Competition ?? 'Unknown competition',
          participant1: fixture?.Participant1 ?? `Fixture ${fixtureId}`,
          participant2: fixture?.Participant2 ?? '',
          sizeBytes,
          updatedAtMs: Math.round(updatedAtMs),
        });
      }
      summaries.sort((left, right) => right.updatedAtMs - left.updatedAtMs);
      return ok(summaries);
    },

    createSession: async (rawFixtureId, rawSpeed) => {
      const fixtureId =
        typeof rawFixtureId === 'number' ? rawFixtureId : Number.parseInt(String(rawFixtureId), 10);
      if (!Number.isInteger(fixtureId) || fixtureId <= 0) {
        return err('invalid_fixture_id');
      }
      const speed = parseSpeed(rawSpeed);
      if (speed === null) {
        return err(`invalid_speed: use one of ${REPLAY_SPEEDS.join(', ')}`);
      }
      if (sessions.size >= MAX_ACTIVE_SESSIONS) {
        return err('replay_capacity');
      }
      if (deps.isFixtureLive(fixtureId)) {
        return err('fixture_still_live');
      }
      const tape = readTape(tapeFilePath(deps.deck, fixtureId));
      if (!tape.ok) {
        return err('no_tape');
      }
      if (tape.value.entries.length === 0) {
        return err('no_tape');
      }

      const store = createMatchStateStore();
      const sessionId = randomUUID();
      const game = createGameService({
        persistence: createMemoryPersistence(),
        store,
        onSettlement: (notice) => deps.onSettlement(sessionId, notice),
        nowMs,
      });
      // The hidden session player: replay picks belong to it, in memory only.
      const guest = await game.createGuestPlayer('Replay guest');
      if (!guest.ok) {
        return err(`replay guest creation failed: ${guest.error}`);
      }

      const session: ReplaySession = {
        id: sessionId,
        fixtureId,
        speed,
        startedAtMs: nowMs(),
        store,
        game,
        guestPlayerId: guest.value.playerId,
        guestPlayerToken: guest.value.playerToken,
        scoresLatency: createLatencyTracker(),
        oddsLatency: createLatencyTracker(),
        entries: tape.value.entries,
        cursor: 0,
        skippedEntryCount: tape.value.skippedLineCount,
        finished: false,
        lastActivityMs: nowMs(),
        cancelStep: null,
      };
      sessions.set(sessionId, session);
      ensureSweepRunning();
      console.log(
        `[createReplaySession] ${sessionId} fixture ${fixtureId} speed ${speed}x, ${session.entries.length} entries`,
      );
      scheduleNextStep(session, MIN_STEP_DELAY_MS);
      return ok({ session: describeSession(session) });
    },

    sessionInfo: (sessionId) => {
      const session = sessions.get(sessionId);
      if (session === undefined) {
        return err('unknown_session');
      }
      session.lastActivityMs = nowMs();
      return ok(describeSession(session));
    },

    setSpeed: (sessionId, rawSpeed) => {
      const session = sessions.get(sessionId);
      if (session === undefined) {
        return err('unknown_session');
      }
      const speed = parseSpeed(rawSpeed);
      if (speed === null) {
        return err(`invalid_speed: use one of ${REPLAY_SPEEDS.join(', ')}`);
      }
      // Takes effect from the next scheduled gap; the step already in flight
      // keeps the delay computed under the previous speed.
      session.speed = speed;
      session.lastActivityMs = nowMs();
      return ok(describeSession(session));
    },

    lockPick: async (sessionId, rawOptionId) => {
      const session = sessions.get(sessionId);
      if (session === undefined) {
        return err('unknown_session');
      }
      session.lastActivityMs = nowMs();
      return session.game.lockPick(
        session.guestPlayerId,
        session.guestPlayerToken,
        session.fixtureId,
        rawOptionId,
      );
    },

    profile: async (sessionId) => {
      const session = sessions.get(sessionId);
      if (session === undefined) {
        return err('unknown_session');
      }
      session.lastActivityMs = nowMs();
      return session.game.profile(session.guestPlayerId);
    },

    buildPayload: (sessionId) => {
      const session = sessions.get(sessionId);
      if (session === undefined) {
        return null;
      }
      const state = getMatchState(session.store, session.fixtureId);
      if (state === undefined) {
        return null;
      }
      return buildLivePayloadForState(state, session.scoresLatency, session.oddsLatency);
    },

    hasSession: (sessionId) => sessions.has(sessionId),

    activeSessionCount: () => sessions.size,

    stopAll: () => {
      for (const session of [...sessions.values()]) {
        destroySession(session);
      }
    },
  };
}
