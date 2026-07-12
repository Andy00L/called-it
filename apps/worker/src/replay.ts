import { randomUUID } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { err, ok, type Result } from '@calledit/txline';
import type { OddsPayload, ScoresUpdate } from '@calledit/txline';
import type {
  LivePayload,
  LockResult,
  MyPickEntry,
  NearMissNotice,
  ProfilePayload,
  ReplayCreateResult,
  ReplaySessionInfo,
  ReplayTapeSummary,
  SettlementNotice,
} from '@calledit/contracts';
import type { Fixture } from '@calledit/txline';
import {
  readTape,
  readTapeFinalScore,
  tapeFilePath,
  type TapeDeck,
  type TapeEntry,
} from './tape.js';
import { readStat } from '@calledit/engine';
import {
  applyOddsPayload,
  applyScoresUpdate,
  createMatchStateStore,
  getMatchState,
  type MatchStateStore,
} from './state.js';
import { createGameService, type GameService } from './game.js';
import { createMemoryPersistence } from './persistence-memory.js';
import { createWalletVerifier } from './wallet-auth.js';
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

// Pacing clamps. The floor is the pump tick: entries whose scaled gaps fit
// inside one tick are applied together with a single SSE frame at the end,
// so the floor caps the frame rate, never the playback speed (a per-entry
// floor capped 60x near 9x through dense in-running odds). The ceiling
// compresses dead air (half time is 15 real minutes of nothing even at 1x).
const MIN_STEP_DELAY_MS = 15;
const MAX_STEP_DELAY_MS = 10000;

// A session dies this long after its last activity (applied entry or API
// touch), finished or not; a sweep runs on a fixed cadence.
const SESSION_IDLE_TTL_MS = 30 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

// Tapes smaller than this are connection stubs, not replayable matches.
const MIN_TAPE_BYTES = 2048;

// A fixture state can outlive its match: a worker restart wipes the live
// store, then a few post-match odds ticks resurrect an odds-only state stuck
// at phase 'pre', which reads as "unfinished" forever and would hide the
// finished match's tape (seen in prod: Spain-Belgium, fixture 18218149). So
// "still recording" requires BOTH an unfinished state AND a tape file that
// was appended recently; a quiet tape is replayable regardless of the state.
const TAPE_QUIET_MS = 10 * 60 * 1000;

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
  onNearMiss(sessionId: string, notice: NearMissNotice): void;
  scheduler?: ReplayScheduler;
  nowMs?: () => number;
}

export interface ReplayManager {
  listTapes(): Result<ReplayTapeSummary[], string>;
  createSession(rawFixtureId: unknown, rawSpeed: unknown): Promise<Result<ReplayCreateResult, string>>;
  sessionInfo(sessionId: string): Result<ReplaySessionInfo, string>;
  setSpeed(sessionId: string, rawSpeed: unknown): Result<ReplaySessionInfo, string>;
  lockPick(sessionId: string, rawOptionId: unknown): Promise<Result<LockResult, string>>;
  /** The session's picks with settlements (the reload restore for replays). */
  listPicks(sessionId: string): Promise<Result<MyPickEntry[], string>>;
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
  /** Tail-read final goals per tape, keyed by mtime so a re-append refreshes. */
  const finalGoalsCache = new Map<
    number,
    { mtimeMs: number; goals: { p1: number; p2: number } | null }
  >();

  const finalGoalsOf = (
    fixtureId: number,
    filePath: string,
    mtimeMs: number,
  ): { p1: number; p2: number } | null => {
    const cached = finalGoalsCache.get(fixtureId);
    if (cached !== undefined && cached.mtimeMs === mtimeMs) {
      return cached.goals;
    }
    const score = readTapeFinalScore(filePath);
    const goals =
      score === null
        ? null
        : { p1: readStat(score, 'goals', 'p1'), p2: readStat(score, 'goals', 'p2') };
    finalGoalsCache.set(fixtureId, { mtimeMs, goals });
    return goals;
  };
  let sweepTimer: NodeJS.Timeout | null = null;
  // Replay games never link wallets, but the game service requires a verifier;
  // one shared instance satisfies the dependency without any wallet surface.
  const replayWalletVerifier = createWalletVerifier({ nowMs });

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

  /** Apply the entry under the cursor; advance. True when match state changed. */
  const applyNextEntry = async (session: ReplaySession): Promise<boolean> => {
    const entry = session.entries[session.cursor];
    if (entry === undefined) {
      return false;
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
      return true;
    }
    session.skippedEntryCount += 1;
    return false;
  };

  /** Real-ms wait to the next entry at the session speed, unclamped; null at tape end. */
  const scaledGapToNextMs = (session: ReplaySession): number | null => {
    const appliedEntry = session.entries[session.cursor - 1];
    const nextEntry = session.entries[session.cursor];
    if (nextEntry === undefined || appliedEntry === undefined) {
      return null;
    }
    return Math.max(0, nextEntry.receivedAtMs - appliedEntry.receivedAtMs) / session.speed;
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

  /** True while the tape has not reached kickoff yet. */
  const isBeforeKickoff = (session: ReplaySession): boolean => {
    const state = getMatchState(session.store, session.fixtureId);
    return state === undefined || state.phase === 'pre';
  };

  const runStep = async (session: ReplaySession): Promise<void> => {
    if (!sessions.has(session.id)) {
      return;
    }
    try {
      let stateChanged = await applyNextEntry(session);
      // Fast-forward the pre-match head: recorders capture hours of warm-up
      // odds before the whistle; a replay viewer lands at kickoff instead of
      // sitting through them at replay speed. Each apply awaits, so the
      // burst yields to the event loop; the session-liveness check lets
      // stopAll interrupt a burst.
      while (
        session.cursor < session.entries.length &&
        isBeforeKickoff(session) &&
        sessions.has(session.id)
      ) {
        stateChanged = (await applyNextEntry(session)) || stateChanged;
      }
      // Batch dense stretches: entries whose scaled gaps fit inside one pump
      // tick are applied together, so 60x stays 60x through in-running odds
      // bursts. The single frame below caps what SSE clients see per tick.
      let scaledGapMs = scaledGapToNextMs(session);
      let batchedGapMs = 0;
      while (
        scaledGapMs !== null &&
        batchedGapMs + scaledGapMs < MIN_STEP_DELAY_MS &&
        sessions.has(session.id)
      ) {
        batchedGapMs += scaledGapMs;
        stateChanged = (await applyNextEntry(session)) || stateChanged;
        scaledGapMs = scaledGapToNextMs(session);
      }
      if (stateChanged && sessions.has(session.id)) {
        deps.onState(session.id);
      }
      if (scaledGapMs === null) {
        await finishSession(session);
        return;
      }
      scheduleNextStep(
        session,
        Math.min(MAX_STEP_DELAY_MS, Math.max(MIN_STEP_DELAY_MS, batchedGapMs + scaledGapMs)),
      );
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
        // A tape still being written belongs to a live match: not replayable
        // yet. Quiet tapes list even when the state reads unfinished (see
        // TAPE_QUIET_MS: stale resurrected states must not hide finished
        // matches).
        if (deps.isFixtureLive(fixtureId) && nowMs() - updatedAtMs < TAPE_QUIET_MS) {
          continue;
        }
        const fixture = fixturesById.get(fixtureId);
        const finalGoals = finalGoalsOf(
          fixtureId,
          resolve(deps.deck.directory, fileName),
          updatedAtMs,
        );
        summaries.push({
          fixtureId,
          competition: fixture?.Competition ?? 'Unknown competition',
          participant1: fixture?.Participant1 ?? `Fixture ${fixtureId}`,
          participant2: fixture?.Participant2 ?? '',
          sizeBytes,
          updatedAtMs: Math.round(updatedAtMs),
          finalGoalsP1: finalGoals?.p1 ?? null,
          finalGoalsP2: finalGoals?.p2 ?? null,
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
      // Same recording test as listTapes: an unfinished state alone must not
      // block replaying a tape that went quiet (stale resurrected states).
      let tapeMtimeMs = 0;
      try {
        tapeMtimeMs = statSync(tapeFilePath(deps.deck, fixtureId)).mtimeMs;
      } catch {
        return err('no_tape');
      }
      if (deps.isFixtureLive(fixtureId) && nowMs() - tapeMtimeMs < TAPE_QUIET_MS) {
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
        walletVerifier: replayWalletVerifier,
        onSettlement: (notice) => deps.onSettlement(sessionId, notice),
        onNearMiss: (notice) => deps.onNearMiss(sessionId, notice),
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

    listPicks: async (sessionId) => {
      const session = sessions.get(sessionId);
      if (session === undefined) {
        return err('unknown_session');
      }
      session.lastActivityMs = nowMs();
      return session.game.listPlayerFixturePicks(
        session.guestPlayerId,
        session.guestPlayerToken,
        session.fixtureId,
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
