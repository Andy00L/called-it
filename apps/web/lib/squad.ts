import type {
  MatchPlayerStatsPayload,
  PlayerActionEntry,
  PlayerActionKind,
  PlayerStatLineEntry,
  PitchTeam,
  SquadPlayerEntry,
} from '@calledit/contracts';

/**
 * Squad display derivations, all from feed facts (lineups, jersey,
 * PlayerStats, attributed actions). The feed serves a jersey COLOR WORD and
 * player identities; it serves no crests, photos, or tactical formations.
 */

export interface JerseyStyle {
  /** Chip fill, a concrete color (chips are printed roundels, not tokens). */
  fill: string;
  /** Number color, chosen for contrast on the fill. */
  numberColor: string;
}

/**
 * Perceived-luminance test on a #RRGGBB fill (Rec. 601 weights). A light
 * jersey (white, yellow) makes a poor pressure-halo hue on the pale pitch,
 * so the pitch falls its halo back to the accent for those; the ball itself
 * still wears the real color.
 */
export function isLightJersey(fill: string): boolean {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(fill);
  if (match === null) {
    return false;
  }
  const red = Number.parseInt(match[1] ?? '0', 16);
  const green = Number.parseInt(match[2] ?? '0', 16);
  const blue = Number.parseInt(match[3] ?? '0', 16);
  return (0.299 * red + 0.587 * green + 0.114 * blue) / 255 > 0.7;
}

// Shirt-color words observed or plausible on the feed, mapped to printed
// tones that hold a 4.5:1 number on top (sourceRef: jersey Data.Color,
// "white"/"red" observed live 2026-07-12).
const JERSEY_STYLES: Record<string, JerseyStyle> = {
  white: { fill: '#FFFFFF', numberColor: '#12170F' },
  red: { fill: '#C6262E', numberColor: '#FFFFFF' },
  blue: { fill: '#2A4B9B', numberColor: '#FFFFFF' },
  navy: { fill: '#1D2E5C', numberColor: '#FFFFFF' },
  sky: { fill: '#78ADD9', numberColor: '#12170F' },
  yellow: { fill: '#E8C33C', numberColor: '#12170F' },
  green: { fill: '#1F6B2C', numberColor: '#FFFFFF' },
  black: { fill: '#12170F', numberColor: '#FFFFFF' },
  orange: { fill: '#D97A2B', numberColor: '#12170F' },
  purple: { fill: '#5B3A8C', numberColor: '#FFFFFF' },
  maroon: { fill: '#6E1F2C', numberColor: '#FFFFFF' },
  grey: { fill: '#B4B2A9', numberColor: '#12170F' },
  gray: { fill: '#B4B2A9', numberColor: '#12170F' },
};

// When the jersey record has not arrived, the sides fall back to the
// programme's own neutrals (a styling default, never a color claim).
const FALLBACK_P1: JerseyStyle = { fill: '#FFFFFF', numberColor: '#12170F' };
const FALLBACK_P2: JerseyStyle = { fill: '#12170F', numberColor: '#FFFFFF' };

export function jerseyStyleFor(jerseyColor: string | null, side: PitchTeam): JerseyStyle {
  if (jerseyColor !== null) {
    const known = JERSEY_STYLES[jerseyColor.toLowerCase()];
    if (known !== undefined) {
      return known;
    }
  }
  return side === 'p1' ? FALLBACK_P1 : FALLBACK_P2;
}

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** Age in whole years from the feed's ISO date of birth; null when absent. */
export function ageFromDateOfBirth(dateOfBirth: string | null, nowMs: number): number | null {
  if (dateOfBirth === null) {
    return null;
  }
  const bornMs = Date.parse(dateOfBirth);
  if (Number.isNaN(bornMs)) {
    return null;
  }
  return Math.floor((nowMs - bornMs) / MS_PER_YEAR);
}

/** Chip label: the surname part of "Messi, Lionel", capped like the export. */
export function shortSurname(name: string): string {
  return (name.split(',')[0] ?? name).trim().slice(0, 9);
}

export const PLAYER_ACTION_LABEL: Record<PlayerActionKind, string> = {
  goal: 'Goal',
  yellow_card: 'Yellow card',
  red_card: 'Red card',
  sub_on: 'Subbed on',
  sub_off: 'Subbed off',
  injury: 'Injury',
};

const ZERO_LINE: PlayerStatLineEntry = { goals: 0, yellowCards: 0, redCards: 0 };

export function statsForPlayer(
  playerStats: MatchPlayerStatsPayload | null,
  side: PitchTeam,
  playerId: number,
): PlayerStatLineEntry {
  return playerStats?.[side]?.[String(playerId)] ?? ZERO_LINE;
}

/** A red card keeps the player visible on the pitch, grayed (never benched). */
export function isRedCarded(playerActions: PlayerActionEntry[], playerId: number): boolean {
  return playerActions.some(
    (action) => action.kind === 'red_card' && action.playerId === playerId,
  );
}

/** True when the player left the field through a substitution. */
export function wasSubbedOff(playerActions: PlayerActionEntry[], playerId: number): boolean {
  return playerActions.some(
    (action) => action.kind === 'sub_off' && action.playerId === playerId,
  );
}

/** The player's attributed match moments, newest first (the card timeline). */
export function timelineForPlayer(
  playerActions: PlayerActionEntry[],
  playerId: number,
): PlayerActionEntry[] {
  return playerActions.filter((action) => action.playerId === playerId).reverse();
}

/** Where a squad member renders right now. */
export function placementOf(
  player: SquadPlayerEntry,
  playerActions: PlayerActionEntry[],
): 'pitch' | 'pitch_sent_off' | 'bench' {
  if (player.onPitch) {
    return 'pitch';
  }
  if (isRedCarded(playerActions, player.playerId)) {
    return 'pitch_sent_off';
  }
  return 'bench';
}
