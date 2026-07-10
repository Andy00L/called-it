import {
  extractEvent,
  MARKET_MATCH_RESULT,
  parsePossibleEvent,
  participantToTeam,
  possessionTypeToDanger,
  readMatchResult,
  type DangerLevel,
  type MatchEvent,
  type MatchResultProbabilities,
  type PitchEventMarker,
  type PitchPendingSignal,
  type PitchTeam,
} from '@calledit/engine';
import type { OddsPayload, ScoresUpdate, SoccerFixtureScore } from '@calledit/txline';
import type { MatchPhase } from '@calledit/contracts';

/**
 * In-memory live state per fixture, reduced from the two streams. Restart
 * recovery note: Score is cumulative, so the next scores update restores
 * totals; earlier events are only needed to resolve picks locked BEFORE the
 * restart, which the future picks store will replay from tapes.
 */

// Phase is derived from actions and the clock. GameState is unreliable and
// the StatusId enum is undocumented (docs/FEEDBACK.md, findings 5). The union
// itself lives in the wire contract shared with the web app.
export type { MatchPhase };

// Feed action marking the end of a match (action vocabulary observed live,
// see docs/FEEDBACK.md confirmed schema notes).
const ACTION_GAME_FINALISED = 'game_finalised';

// Resolution-relevant events kept per fixture. A match produces well under
// 100 goal/corner/card events; the cap only guards against a runaway feed.
const MAX_EVENTS_PER_FIXTURE = 500;

// Bound on the dedupe key set across all fixtures (roughly a full match day
// of updates); oldest keys are evicted first.
const MAX_SEEN_EVENT_KEYS = 100000;

export interface MatchState {
  fixtureId: number;
  phase: MatchPhase;
  clockSeconds: number;
  clockRunning: boolean;
  statusId: number | undefined;
  score: SoccerFixtureScore | undefined;
  /** Resolution-relevant events (goal, corner, card kinds), in arrival order. */
  events: MatchEvent[];
  matchResult: MatchResultProbabilities | null;
  /** Ts of the odds record behind matchResult, 0 before the first one. */
  matchResultTs: number;
  // Pressure-pitch inputs (raw facts; geometry is computed in live-payload).
  /** Team in possession from the latest possession record, null before any. */
  possessingTeam: PitchTeam | null;
  /** Danger of the current possession, null before any possession record. */
  dangerLevel: DangerLevel | null;
  /** Pre-event signal (PossibleEvent), cleared when the next event lands. */
  pendingSignal: PitchPendingSignal | null;
  /** Newest placed goal/corner/card, with a monotonic id so it animates once. */
  lastEvent: PitchEventMarker | null;
  /** Monotonic marker id source for lastEvent. */
  eventMarkerSeq: number;
  lastScoresTs: number;
  lastOddsTs: number;
  updatedAtMs: number;
}

export interface MatchStateStore {
  states: Map<number, MatchState>;
  seenEventKeys: Set<string>;
}

export function createMatchStateStore(): MatchStateStore {
  return { states: new Map(), seenEventKeys: new Set() };
}

function getOrCreateState(store: MatchStateStore, fixtureId: number): MatchState {
  const existing = store.states.get(fixtureId);
  if (existing !== undefined) {
    return existing;
  }
  const created: MatchState = {
    fixtureId,
    phase: 'pre',
    clockSeconds: 0,
    clockRunning: false,
    statusId: undefined,
    score: undefined,
    events: [],
    matchResult: null,
    matchResultTs: 0,
    possessingTeam: null,
    dangerLevel: null,
    pendingSignal: null,
    lastEvent: null,
    eventMarkerSeq: 0,
    lastScoresTs: 0,
    lastOddsTs: 0,
    updatedAtMs: 0,
  };
  store.states.set(fixtureId, created);
  return created;
}

function rememberEventKey(store: MatchStateStore, key: string): boolean {
  if (store.seenEventKeys.has(key)) {
    return false;
  }
  if (store.seenEventKeys.size >= MAX_SEEN_EVENT_KEYS) {
    const oldestKey = store.seenEventKeys.values().next().value;
    if (oldestKey !== undefined) {
      store.seenEventKeys.delete(oldestKey);
    }
  }
  store.seenEventKeys.add(key);
  return true;
}

/** Reduce one scores-feed record into the fixture state. */
export function applyScoresUpdate(
  store: MatchStateStore,
  update: ScoresUpdate,
  receivedAtMs: number,
): MatchState {
  const state = getOrCreateState(store, update.FixtureId);
  state.updatedAtMs = receivedAtMs;

  // Ts-guard: Score is cumulative, replacing it with an older record would
  // regress totals; clock and status ride the same guard.
  const isNewest = update.Ts >= state.lastScoresTs;
  if (isNewest) {
    state.lastScoresTs = update.Ts;
    if (update.Score !== undefined) {
      state.score = update.Score;
    }
    if (update.Clock !== undefined) {
      state.clockSeconds = update.Clock.Seconds;
      state.clockRunning = update.Clock.Running;
    }
    if (update.StatusId !== undefined) {
      state.statusId = update.StatusId;
    }
    // Pressure-pitch inputs from the newest record only (older records would
    // regress the momentum). Possession danger updates the team + level;
    // Participant on the record is the team the signal is about.
    const danger = possessionTypeToDanger(update.PossessionType);
    if (danger !== null) {
      state.dangerLevel = danger;
      const possessing = participantToTeam(update.Participant);
      if (possessing !== null) {
        state.possessingTeam = possessing;
      }
    }
    const signal = parsePossibleEvent(update.PossibleEvent, update.Participant);
    if (signal !== null) {
      state.pendingSignal = signal;
    }
  }

  if (update.Action === ACTION_GAME_FINALISED) {
    state.phase = 'finished';
  } else if (state.phase === 'pre') {
    const clockStarted =
      (update.Clock !== undefined && (update.Clock.Running || update.Clock.Seconds > 0)) ||
      state.clockSeconds > 0;
    if (clockStarted) {
      state.phase = 'live';
    }
  }

  const event = extractEvent(update);
  if (event !== null && event.kind !== 'other') {
    const dedupeKey = `${update.FixtureId}:${update.Id ?? 'noid'}:${update.Seq ?? 'noseq'}:${update.Ts}:${update.Action ?? ''}`;
    if (rememberEventKey(store, dedupeKey)) {
      state.events.push(event);
      if (state.events.length > MAX_EVENTS_PER_FIXTURE) {
        state.events.splice(0, state.events.length - MAX_EVENTS_PER_FIXTURE);
      }
      // A placed event feeds the pitch "explosion" and resolves any pre-event
      // shimmer that was anticipating it. event.kind is narrowed to EventKind here.
      state.eventMarkerSeq += 1;
      state.lastEvent = {
        id: state.eventMarkerSeq,
        kind: event.kind,
        team: participantToTeam(event.participant),
        clockSeconds: event.clockSeconds,
      };
      state.pendingSignal = null;
    }
  }

  return state;
}

/** Reduce one odds-feed record; only the 1X2 StablePrice market moves state. */
export function applyOddsPayload(
  store: MatchStateStore,
  payload: OddsPayload,
  receivedAtMs: number,
): MatchState {
  const state = getOrCreateState(store, payload.FixtureId);
  state.updatedAtMs = receivedAtMs;
  if (payload.Ts > state.lastOddsTs) {
    state.lastOddsTs = payload.Ts;
  }

  if (payload.SuperOddsType === MARKET_MATCH_RESULT && payload.Ts >= state.matchResultTs) {
    const probabilities = readMatchResult([payload]);
    if (probabilities !== null) {
      state.matchResult = probabilities;
      state.matchResultTs = payload.Ts;
    }
  }
  return state;
}

export function getMatchState(store: MatchStateStore, fixtureId: number): MatchState | undefined {
  return store.states.get(fixtureId);
}

export function listMatchStates(store: MatchStateStore): MatchState[] {
  return [...store.states.values()];
}

/** True while calls may be generated: the match is live and the clock runs. */
export function isInRunning(state: MatchState): boolean {
  return state.phase === 'live' && state.clockRunning;
}
