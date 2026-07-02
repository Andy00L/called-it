import type {
  ScoresUpdate,
  SoccerFixtureScore,
  SoccerPeriodScore,
  SoccerTotalScore,
} from '@calledit/txline';
import { EVENT_ACTIONS, type EventKind, type MatchEvent, type TeamSelector } from './calls.js';

export type ScorePeriod = 'H1' | 'HT' | 'H2' | 'ET1' | 'ET2' | 'PE' | 'ETTotal' | 'Total';

/** Cumulative stat names (plural), distinct from the singular event kinds. */
export type StatKind = 'goals' | 'corners' | 'cards';

/** Read a single stat from one period bucket. Cards = yellow + red. */
function readPeriodStat(period: SoccerPeriodScore | undefined, stat: StatKind): number {
  if (period === undefined) {
    return 0;
  }
  if (stat === 'goals') {
    return period.Goals ?? 0;
  }
  if (stat === 'corners') {
    return period.Corners ?? 0;
  }
  return (period.YellowCards ?? 0) + (period.RedCards ?? 0);
}

function readTeamStat(
  team: SoccerTotalScore | undefined,
  stat: StatKind,
  period: ScorePeriod,
): number {
  if (team === undefined) {
    return 0;
  }
  return readPeriodStat(team[period], stat);
}

/**
 * Cumulative value of a stat from a Score object, for a team selector and period.
 * This is the primary source of truth for resolution: it is monotonic within a match.
 */
export function readStat(
  score: SoccerFixtureScore | undefined,
  stat: StatKind,
  team: TeamSelector,
  period: ScorePeriod = 'Total',
): number {
  if (score === undefined) {
    return 0;
  }
  if (team === 'p1') {
    return readTeamStat(score.Participant1, stat, period);
  }
  if (team === 'p2') {
    return readTeamStat(score.Participant2, stat, period);
  }
  return (
    readTeamStat(score.Participant1, stat, period) +
    readTeamStat(score.Participant2, stat, period)
  );
}

const ACTION_TO_KIND: Record<string, EventKind> = (() => {
  const map: Record<string, EventKind> = {};
  for (const kind of Object.keys(EVENT_ACTIONS) as EventKind[]) {
    for (const action of EVENT_ACTIONS[kind]) {
      map[action] = kind;
    }
  }
  return map;
})();

/**
 * Normalize a scores-feed record into a MatchEvent. Returns null when the record
 * carries no action or no clock (cannot be placed on the match timeline).
 */
export function extractEvent(update: ScoresUpdate): MatchEvent | null {
  if (update.Action === undefined || update.Clock === undefined) {
    return null;
  }
  const kind = ACTION_TO_KIND[update.Action] ?? 'other';
  return {
    action: update.Action,
    kind,
    participant: update.Participant,
    clockSeconds: update.Clock.Seconds,
    confirmed: update.Confirmed ?? false,
    ts: update.Ts,
  };
}

/** Extract every timeline-placeable event from a list of updates, sorted by clock. */
export function extractEvents(updates: readonly ScoresUpdate[]): MatchEvent[] {
  const events: MatchEvent[] = [];
  for (const update of updates) {
    const event = extractEvent(update);
    if (event !== null) {
      events.push(event);
    }
  }
  events.sort((a, b) => a.clockSeconds - b.clockSeconds || a.ts - b.ts);
  return events;
}

/** Latest known match clock across a set of updates, in seconds. */
export function latestClockSeconds(updates: readonly ScoresUpdate[]): number {
  let max = 0;
  for (const update of updates) {
    if (update.Clock !== undefined && update.Clock.Seconds > max) {
      max = update.Clock.Seconds;
    }
  }
  return max;
}
