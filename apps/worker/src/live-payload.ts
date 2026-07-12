import { buildMomentum, generateCalls, pickBookieDeck, readStat } from '@calledit/engine';
import type {
  LivePayload,
  MatchSquadsPayload,
  SquadPositionGroup,
  TeamSquadPayload,
} from '@calledit/contracts';
import { snapshotLatency, type LatencyTracker } from './latency.js';
import { isInRunning, type MatchState, type StoredTeamSquad } from './state.js';

/**
 * Shared LivePayload composition: the live path (main.ts, global store) and
 * the Time Machine replay path (replay.ts, per-session store) must serve the
 * exact same frame shape so the web client renders both with one code path.
 */

// Events included in live payloads; the full timeline stays in the tape.
export const LIVE_PAYLOAD_EVENT_LIMIT = 50;

// Stable render order for squad rows: keeper line first, forwards last.
const POSITION_GROUP_ORDER: Record<SquadPositionGroup, number> = {
  gk: 0,
  def: 1,
  mid: 2,
  fwd: 3,
  unknown: 4,
};

function toTeamSquadPayload(
  squad: StoredTeamSquad | null,
  jerseyColor: string | null,
  onPitchOverrides: Record<string, boolean>,
): TeamSquadPayload | null {
  if (squad === null) {
    return null;
  }
  const players = squad.players
    .map((player) => ({
      ...player,
      onPitch: onPitchOverrides[String(player.playerId)] ?? player.starter,
    }))
    .sort((left, right) => {
      const groupDelta =
        POSITION_GROUP_ORDER[left.positionGroup] - POSITION_GROUP_ORDER[right.positionGroup];
      if (groupDelta !== 0) {
        return groupDelta;
      }
      // Shirt numbers are served as strings; non-numeric ones sort last.
      const leftNumber = Number.parseInt(left.number ?? '', 10);
      const rightNumber = Number.parseInt(right.number ?? '', 10);
      return (
        (Number.isNaN(leftNumber) ? Number.MAX_SAFE_INTEGER : leftNumber) -
        (Number.isNaN(rightNumber) ? Number.MAX_SAFE_INTEGER : rightNumber)
      );
    });
  return { teamName: squad.teamName, jerseyColor, players };
}

function buildSquadsPayload(state: MatchState): MatchSquadsPayload | null {
  const p1 = toTeamSquadPayload(state.squadP1, state.jerseyColorP1, state.onPitchOverrides);
  const p2 = toTeamSquadPayload(state.squadP2, state.jerseyColorP2, state.onPitchOverrides);
  return p1 === null && p2 === null ? null : { p1, p2 };
}

export function buildLivePayloadForState(
  state: MatchState,
  scoresLatency: LatencyTracker,
  oddsLatency: LatencyTracker,
): LivePayload {
  const catalog = generateCalls({
    clockSeconds: state.clockSeconds,
    score: state.score,
    matchResult: state.matchResult,
    inRunning: isInRunning(state),
  });
  // Possession and pre-event signals only read while the match is live; a
  // finished or pre-match pitch rests on the market tilt (calm), and the last
  // event still shows so a final goal keeps its marker.
  const isLive = state.phase === 'live';
  const momentum = buildMomentum({
    possessingTeam: isLive ? state.possessingTeam : null,
    dangerLevel: isLive ? state.dangerLevel : null,
    matchResult: state.matchResult,
    pendingSignal: isLive ? state.pendingSignal : null,
    lastEvent: state.lastEvent,
  });
  return {
    fixtureId: state.fixtureId,
    phase: state.phase,
    clockSeconds: state.clockSeconds,
    clockRunning: state.clockRunning,
    goalsP1: readStat(state.score, 'goals', 'p1'),
    goalsP2: readStat(state.score, 'goals', 'p2'),
    score: state.score,
    matchResult: state.matchResult,
    eventCount: state.events.length,
    recentEvents: state.events.slice(-LIVE_PAYLOAD_EVENT_LIMIT),
    catalog,
    bookieDeck: pickBookieDeck(catalog),
    momentum,
    squads: buildSquadsPayload(state),
    playerStats: state.playerStats,
    playerActions: state.playerActions,
    latency: { scores: snapshotLatency(scoresLatency), odds: snapshotLatency(oddsLatency) },
    updatedAtMs: state.updatedAtMs,
  };
}
