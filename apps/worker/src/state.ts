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
import type {
  LineupTeamEntry,
  OddsPayload,
  PlayerStatsRecord,
  ScoresUpdate,
  SoccerFixtureScore,
} from '@calledit/txline';
import type {
  MatchPhase,
  MatchPlayerStatsPayload,
  PlayerActionEntry,
  SquadPositionGroup,
} from '@calledit/contracts';

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

// Attributed player moments kept per fixture (goals, cards, subs, injuries);
// a real match produces a few dozen, the cap guards against a runaway feed.
const MAX_PLAYER_ACTIONS = 200;

// Position group ids observed on the live feed (2026-07-12 capture, Argentina
// vs Switzerland lineups; the OpenAPI spec does not document Lineups at all).
const POSITION_GROUP_BY_ID: Record<number, SquadPositionGroup> = {
  34: 'gk',
  35: 'def',
  36: 'mid',
  37: 'fwd',
};

/** One squad member as stored; onPitch is derived at payload build time. */
export interface StoredSquadPlayer {
  playerId: number;
  name: string;
  number: string | null;
  positionGroup: SquadPositionGroup;
  starter: boolean;
}

export interface StoredTeamSquad {
  teamName: string;
  players: StoredSquadPlayer[];
}

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
  // Squad facts (lineups / jersey / PlayerStats records), last-known each.
  squadP1: StoredTeamSquad | null;
  squadP2: StoredTeamSquad | null;
  jerseyColorP1: string | null;
  jerseyColorP2: string | null;
  playerStats: MatchPlayerStatsPayload | null;
  /** Attributed player moments in arrival order (the player timeline). */
  playerActions: PlayerActionEntry[];
  /** Substitution and red-card overrides over the starter flag, by playerId. */
  onPitchOverrides: Record<string, boolean>;
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
    squadP1: null,
    squadP2: null,
    jerseyColorP1: null,
    jerseyColorP2: null,
    playerStats: null,
    playerActions: [],
    onPitchOverrides: {},
    lastScoresTs: 0,
    lastOddsTs: 0,
    updatedAtMs: 0,
  };
  store.states.set(fixtureId, created);
  return created;
}

function parseTeamSquad(entry: LineupTeamEntry): StoredTeamSquad | null {
  if (!Array.isArray(entry.lineups) || typeof entry.preferredName !== 'string') {
    return null;
  }
  const players: StoredSquadPlayer[] = [];
  for (const rosterEntry of entry.lineups) {
    const identity = rosterEntry.player;
    if (identity === undefined || typeof identity.normativeId !== 'number') {
      continue;
    }
    players.push({
      playerId: identity.normativeId,
      name:
        typeof identity.preferredName === 'string' && identity.preferredName !== ''
          ? identity.preferredName
          : `Player ${identity.normativeId}`,
      number: typeof rosterEntry.rosterNumber === 'string' ? rosterEntry.rosterNumber : null,
      positionGroup:
        rosterEntry.positionId !== undefined
          ? (POSITION_GROUP_BY_ID[rosterEntry.positionId] ?? 'unknown')
          : 'unknown',
      starter: rosterEntry.starter === true,
    });
  }
  return players.length === 0 ? null : { teamName: entry.preferredName, players };
}

/** Map the two lineup entries to p1/p2 by team id, index order as fallback. */
function applyLineups(state: MatchState, update: ScoresUpdate): void {
  const entries = update.Lineups;
  if (!Array.isArray(entries) || entries.length === 0) {
    return;
  }
  for (const [index, entry] of entries.entries()) {
    const squad = parseTeamSquad(entry);
    if (squad === null) {
      continue;
    }
    const matchesP1 =
      typeof update.Participant1Id === 'number' && entry.normativeId === update.Participant1Id;
    const matchesP2 =
      typeof update.Participant2Id === 'number' && entry.normativeId === update.Participant2Id;
    if (matchesP1 || (!matchesP2 && index === 0)) {
      state.squadP1 = squad;
    } else {
      state.squadP2 = squad;
    }
  }
}

function normalizePlayerStats(record: PlayerStatsRecord): MatchPlayerStatsPayload {
  const normalizeSide = (
    side: PlayerStatsRecord['Participant1'],
  ): MatchPlayerStatsPayload['p1'] => {
    const normalized: MatchPlayerStatsPayload['p1'] = {};
    for (const [playerId, line] of Object.entries(side ?? {})) {
      normalized[playerId] = {
        goals: line.goals ?? 0,
        yellowCards: line.yellowCards ?? 0,
        redCards: line.redCards ?? 0,
      };
    }
    return normalized;
  };
  return { p1: normalizeSide(record.Participant1), p2: normalizeSide(record.Participant2) };
}

function pushPlayerAction(state: MatchState, action: PlayerActionEntry): void {
  state.playerActions.push(action);
  if (state.playerActions.length > MAX_PLAYER_ACTIONS) {
    state.playerActions.splice(0, state.playerActions.length - MAX_PLAYER_ACTIONS);
  }
}

/**
 * Record attributed player moments and keep onPitch overrides in sync. The
 * feed attributes only goals, cards, substitutions, and injuries; everything
 * else has no player identity and is deliberately not represented here.
 */
function applyPlayerFacts(store: MatchStateStore, state: MatchState, update: ScoresUpdate): void {
  const action = update.Action;
  const data = update.Data;
  if (action === undefined || data === undefined) {
    return;
  }
  const isAttributedCardOrGoal =
    (action === 'goal' || action === 'yellow_card' || action === 'red_card') &&
    update.Confirmed === true &&
    typeof data.PlayerId === 'number';
  const isSubstitution =
    action === 'substitution' &&
    update.Confirmed !== false &&
    typeof data.PlayerInId === 'number' &&
    typeof data.PlayerOutId === 'number';
  const isInjury =
    action === 'injury' && update.Confirmed !== false && typeof data.PlayerId === 'number';
  if (!isAttributedCardOrGoal && !isSubstitution && !isInjury) {
    return;
  }
  // Same composite identity as the event dedupe, distinct namespace: one
  // record must produce its player facts exactly once across re-sends.
  const dedupeKey = `player:${update.FixtureId}:${update.Id ?? 'noid'}:${update.Seq ?? 'noseq'}:${update.Ts}:${action}`;
  if (!rememberEventKey(store, dedupeKey)) {
    return;
  }
  const clockSeconds = update.Clock?.Seconds ?? state.clockSeconds;
  const team = participantToTeam(data.Participant ?? update.Participant);
  if (isSubstitution && data.PlayerInId !== undefined && data.PlayerOutId !== undefined) {
    state.onPitchOverrides[String(data.PlayerInId)] = true;
    state.onPitchOverrides[String(data.PlayerOutId)] = false;
    pushPlayerAction(state, { kind: 'sub_off', playerId: data.PlayerOutId, team, clockSeconds });
    pushPlayerAction(state, { kind: 'sub_on', playerId: data.PlayerInId, team, clockSeconds });
    return;
  }
  if (data.PlayerId === undefined) {
    return;
  }
  if (
    (action === 'goal' || action === 'yellow_card' || action === 'red_card') &&
    isAttributedCardOrGoal
  ) {
    pushPlayerAction(state, { kind: action, playerId: data.PlayerId, team, clockSeconds });
    if (action === 'red_card') {
      state.onPitchOverrides[String(data.PlayerId)] = false;
    }
    return;
  }
  pushPlayerAction(state, { kind: 'injury', playerId: data.PlayerId, team, clockSeconds });
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
    // Squad facts ride the same newest-record guard: lineups re-sends replace
    // the roster, PlayerStats is a cumulative snapshot replaced wholesale, and
    // a jersey record names one team's shirt color.
    applyLineups(state, update);
    if (update.PlayerStats !== undefined) {
      state.playerStats = normalizePlayerStats(update.PlayerStats);
    }
    if (update.Action === 'jersey' && typeof update.Data?.Color === 'string') {
      const jerseyTeam = participantToTeam(update.Participant);
      if (jerseyTeam === 'p1') {
        state.jerseyColorP1 = update.Data.Color;
      } else if (jerseyTeam === 'p2') {
        state.jerseyColorP2 = update.Data.Color;
      }
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

  // Attributed player facts are discrete moments: deduped by record identity,
  // never Ts-guarded (a late-arriving sub still happened).
  applyPlayerFacts(store, state, update);

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
