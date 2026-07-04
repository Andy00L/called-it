/**
 * Scoring: a call is worth 100 times its fair decimal odds, i.e. points scale
 * inversely with the market probability at lock time. Calling a 12% event pays
 * round(100 / 0.12) = 833; calling an 85% event pays round(100 / 0.85) = 118.
 */

export const MAX_POINTS = 2000;
export const MIN_POINTS = 100;
export const STREAK_STEP = 1.1;
export const MAX_STREAK_MULTIPLIER = 3;

/** Base points for a hit, given the market probability as a fraction in (0, 1]. */
export function pointsForProbability(probabilityFraction: number): number {
  if (!Number.isFinite(probabilityFraction) || probabilityFraction <= 0) {
    return MAX_POINTS;
  }
  if (probabilityFraction >= 1) {
    return MIN_POINTS;
  }
  const raw = Math.round(100 / probabilityFraction);
  return Math.min(Math.max(raw, MIN_POINTS), MAX_POINTS);
}

/**
 * Multiplier applied to a hit given the number of consecutive hits already held
 * (before this one). First hit in a streak: 1.0x. Each further consecutive hit
 * multiplies by 1.1, capped at 3.0x.
 */
export function streakMultiplier(consecutiveHitsBefore: number): number {
  const safe = Math.max(0, Math.floor(consecutiveHitsBefore));
  return Math.min(STREAK_STEP ** safe, MAX_STREAK_MULTIPLIER);
}

/** Final points awarded for a hit, streak included. */
export function awardPoints(probabilityFraction: number, consecutiveHitsBefore: number): number {
  const base = pointsForProbability(probabilityFraction);
  return Math.round(base * streakMultiplier(consecutiveHitsBefore));
}

/** Streak state transition. A hit increments the streak; a miss resets it. */
export function nextStreak(current: number, outcome: 'hit' | 'miss'): number {
  if (outcome === 'hit') {
    return Math.max(0, Math.floor(current)) + 1;
  }
  return 0;
}

/**
 * A pick after settlement: the market probability locked at pick time, the
 * outcome, and the points actually awarded (streak included, 0 on a miss).
 * Shared scoring unit consumed by the bookie and calibration modules.
 */
export interface SettledPick {
  probabilityFraction: number;
  outcome: 'hit' | 'miss';
  pointsAwarded: number;
}

/** Total points over a slate of settled picks (misses carry 0 by contract). */
export function sumAwardedPoints(picks: readonly SettledPick[]): number {
  let total = 0;
  for (const pick of picks) {
    total += pick.pointsAwarded;
  }
  return total;
}
