import type { SoccerPossessionType } from '@calledit/txline';
import type { EventKind } from './calls.js';
import type { MatchResultProbabilities } from './odds.js';

/**
 * Pressure pitch: an HONEST abstraction of match momentum, not positional
 * tracking. The TxLINE feed carries no player or ball coordinates; it carries
 * possession danger states (Safe/Attack/Danger/HighDanger), pre-event signals
 * (a corner/goal/penalty looks imminent), the acting team, and the live
 * de-margined win market. This module turns those into one number, `ballAdvance`
 * (where the pressure is on a top-down pitch), plus a heat `intensity`. It never
 * invents a position we do not have: the ball is a momentum needle, driven by
 * the danger state when present and by the market tilt when it is not.
 */

export type DangerLevel = 'safe' | 'attack' | 'danger' | 'high_danger';
export type PitchTeam = 'p1' | 'p2';
export type PitchSignalKind = 'goal' | 'penalty' | 'corner';

/** A pre-event signal from the feed (PossibleEvent), to shimmer before it lands. */
export interface PitchPendingSignal {
  kind: PitchSignalKind;
  team: PitchTeam | null;
}

/** The last placed event, to "explode" on the pitch once. Id makes it animate once. */
export interface PitchEventMarker {
  id: number;
  kind: EventKind;
  team: PitchTeam | null;
  clockSeconds: number;
}

export interface PitchMomentum {
  /** Team currently pressing, or null before any possession signal. */
  possessingTeam: PitchTeam | null;
  /** Danger of the current possession, or null when no possession record seen. */
  dangerLevel: DangerLevel | null;
  /**
   * Where the pressure sits along the pitch length: 0 = p1's goal, 1 = p2's
   * goal, 0.5 = midfield. p1 attacks toward 1. Derived, never tracked.
   */
  ballAdvance: number;
  /** Glow heat for the hot zone, 0 (calm) to 1 (a shot looks on). */
  intensity: number;
  pendingSignal: PitchPendingSignal | null;
  lastEvent: PitchEventMarker | null;
}

// How far off midfield each danger level pushes the pressure (fraction of half
// a pitch). HighDanger sits near the box, never fully on the goal line.
const DANGER_ADVANCE_OFFSET: Record<DangerLevel, number> = {
  safe: 0.08,
  attack: 0.22,
  danger: 0.36,
  high_danger: 0.46,
};

// Hot-zone glow per danger level.
const DANGER_INTENSITY: Record<DangerLevel, number> = {
  safe: 0.12,
  attack: 0.4,
  danger: 0.72,
  high_danger: 1,
};

// When no possession danger is known, the market's win tilt nudges the ball
// this far off center at most (a gentle, honest momentum read from odds).
const MARKET_TILT_MAX_OFFSET = 0.16;

function clampAdvance(value: number): number {
  return Math.min(0.92, Math.max(0.08, value));
}

/** Map a feed PossessionType to our danger level; unknown/absent maps to null. */
export function possessionTypeToDanger(type: SoccerPossessionType | undefined): DangerLevel | null {
  switch (type) {
    case 'SafePossession':
      return 'safe';
    case 'AttackPossession':
      return 'attack';
    case 'DangerPossession':
      return 'danger';
    case 'HighDangerPossession':
      return 'high_danger';
    default:
      return null;
  }
}

/** Map a feed Participant (1 or 2) to a pitch team; anything else is null. */
export function participantToTeam(participant: number | undefined): PitchTeam | null {
  if (participant === 1) {
    return 'p1';
  }
  if (participant === 2) {
    return 'p2';
  }
  return null;
}

/**
 * Read a PossibleEvent map (keys like Goal/Penalty/Corner, case-insensitive)
 * into one pending signal, most exciting first. Null when nothing is signaled.
 */
export function parsePossibleEvent(
  possibleEvent: Record<string, boolean> | undefined,
  participant: number | undefined,
): PitchPendingSignal | null {
  if (possibleEvent === undefined) {
    return null;
  }
  const flags = new Map<string, boolean>();
  for (const [key, value] of Object.entries(possibleEvent)) {
    flags.set(key.toLowerCase(), value === true);
  }
  const team = participantToTeam(participant);
  // Order by drama: a goal signal outranks a penalty outranks a corner.
  const order: PitchSignalKind[] = ['goal', 'penalty', 'corner'];
  for (const kind of order) {
    if (flags.get(kind) === true) {
      return { kind, team };
    }
  }
  return null;
}

export interface MomentumInput {
  possessingTeam: PitchTeam | null;
  dangerLevel: DangerLevel | null;
  matchResult: MatchResultProbabilities | null;
  pendingSignal: PitchPendingSignal | null;
  lastEvent: PitchEventMarker | null;
}

/**
 * Assemble the display momentum from the raw facts the reducer tracked. When a
 * possession danger is known it drives the ball; otherwise the market win tilt
 * (p1 minus p2) nudges it gently off center so the pitch still breathes.
 */
export function buildMomentum(input: MomentumInput): PitchMomentum {
  let ballAdvance = 0.5;
  let intensity = DANGER_INTENSITY.safe;

  if (input.possessingTeam !== null && input.dangerLevel !== null) {
    const offset = DANGER_ADVANCE_OFFSET[input.dangerLevel];
    ballAdvance = input.possessingTeam === 'p1' ? 0.5 + offset : 0.5 - offset;
    intensity = DANGER_INTENSITY[input.dangerLevel];
  } else if (input.matchResult !== null) {
    // Fallback momentum from the live market: a rising p1 favorite tilts the
    // pressure toward p2's goal. Always available, honest, and never claims a
    // possession we did not observe.
    const tilt = input.matchResult.p1 - input.matchResult.p2;
    ballAdvance = 0.5 + tilt * MARKET_TILT_MAX_OFFSET;
  }

  return {
    possessingTeam: input.possessingTeam,
    dangerLevel: input.dangerLevel,
    ballAdvance: clampAdvance(ballAdvance),
    intensity,
    pendingSignal: input.pendingSignal,
    lastEvent: input.lastEvent,
  };
}
