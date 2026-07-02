/**
 * Call predicates and their resolvers. Pure functions over match events; no I/O.
 *
 * Two families of call:
 *  - event_window: "a {goal|corner|card} happens between clock A and clock B"
 *  - prob_hold:    "team X's market win probability is still >= T at clock A"
 */

export type EventKind = 'goal' | 'corner' | 'card';
export type TeamSelector = 'either' | 'p1' | 'p2';
export type PickOutcome = 'hit' | 'miss' | 'pending';

/** Actions from the scores feed that map to each call event kind. */
export const EVENT_ACTIONS: Record<EventKind, readonly string[]> = {
  goal: ['goal'],
  corner: ['corner'],
  card: ['yellow_card', 'red_card'],
};

/** A confirmed, clock-stamped match event, normalized from a ScoresUpdate. */
export interface MatchEvent {
  action: string;
  kind: EventKind | 'other';
  participant: number | undefined;
  clockSeconds: number;
  confirmed: boolean;
  ts: number;
}

export interface EventWindowPredicate {
  kind: 'event_window';
  event: EventKind;
  team: TeamSelector;
  fromClockSeconds: number;
  toClockSeconds: number;
}

export interface ProbHoldPredicate {
  kind: 'prob_hold';
  team: 'p1' | 'p2';
  minProbabilityFraction: number;
  atClockSeconds: number;
}

export type CallPredicate = EventWindowPredicate | ProbHoldPredicate;

function teamMatches(selector: TeamSelector, participant: number | undefined): boolean {
  if (selector === 'either') {
    return true;
  }
  if (selector === 'p1') {
    return participant === 1;
  }
  return participant === 2;
}

function eventMatches(predicate: EventWindowPredicate, event: MatchEvent): boolean {
  if (!event.confirmed) {
    return false;
  }
  const actions = EVENT_ACTIONS[predicate.event];
  if (!actions.includes(event.action)) {
    return false;
  }
  if (!teamMatches(predicate.team, event.participant)) {
    return false;
  }
  return (
    event.clockSeconds >= predicate.fromClockSeconds &&
    event.clockSeconds <= predicate.toClockSeconds
  );
}

/**
 * Resolve an event-window call given every confirmed event observed so far and the
 * latest known match clock. Hit as soon as a matching event falls inside the window;
 * miss once the clock passes the window end with no match; pending otherwise.
 */
export function resolveEventWindow(
  predicate: EventWindowPredicate,
  events: readonly MatchEvent[],
  currentClockSeconds: number,
): PickOutcome {
  for (const event of events) {
    if (eventMatches(predicate, event)) {
      return 'hit';
    }
  }
  if (currentClockSeconds > predicate.toClockSeconds) {
    return 'miss';
  }
  return 'pending';
}

/**
 * Resolve a probability-hold call. Pending until the match clock reaches the target;
 * then hit if the observed probability is at or above the threshold, else miss.
 * `probabilityAtTarget` is the team's fraction observed at or after the target clock.
 */
export function resolveProbHold(
  predicate: ProbHoldPredicate,
  probabilityAtTarget: number | undefined,
  currentClockSeconds: number,
): PickOutcome {
  if (currentClockSeconds < predicate.atClockSeconds || probabilityAtTarget === undefined) {
    return 'pending';
  }
  return probabilityAtTarget >= predicate.minProbabilityFraction ? 'hit' : 'miss';
}
