import type { SettledPick } from './points.js';

/**
 * Skill metrics over a slate of settled picks. The market supplies the
 * probability at lock; the player supplies the selection. Together these
 * metrics say whether a player finds spots the market underprices, instead
 * of just accumulating points by volume.
 *
 * - edgeVsMarket: observed hit rate minus the market-implied hit rate over
 *   the same picks. Positive edge means outcomes beat the market's pricing.
 * - marketBrierScore: mean squared error of the market probability against
 *   the outcome, over the player's slate. A high value means the player
 *   hunts picks the market priced poorly.
 * - calibrationBuckets: hit rate per probability band, the data behind a
 *   calibration chart (observed rate above the diagonal = edge in that band).
 */

/** Hit rate minus market-implied hit rate, as a fraction. Null on an empty slate. */
export function edgeVsMarket(picks: readonly SettledPick[]): number | null {
  if (picks.length === 0) {
    return null;
  }
  let hitCount = 0;
  let impliedSum = 0;
  for (const pick of picks) {
    if (pick.outcome === 'hit') {
      hitCount += 1;
    }
    impliedSum += pick.probabilityFraction;
  }
  return hitCount / picks.length - impliedSum / picks.length;
}

/** Brier score of the market probabilities over the slate. Null on an empty slate. */
export function marketBrierScore(picks: readonly SettledPick[]): number | null {
  if (picks.length === 0) {
    return null;
  }
  let squaredErrorSum = 0;
  for (const pick of picks) {
    const outcomeValue = pick.outcome === 'hit' ? 1 : 0;
    const errorValue = pick.probabilityFraction - outcomeValue;
    squaredErrorSum += errorValue * errorValue;
  }
  return squaredErrorSum / picks.length;
}

export interface CalibrationBucket {
  /** Inclusive lower bound of the market probability band, fraction. */
  lowerBoundFraction: number;
  /** Upper bound of the band, fraction. Exclusive except for the last band. */
  upperBoundFraction: number;
  pickCount: number;
  hitCount: number;
  /** Mean market probability of the picks in the band. Null when the band is empty. */
  averageProbabilityFraction: number | null;
  /** Observed hit rate in the band. Null when the band is empty. */
  hitRateFraction: number | null;
}

// Five 20 percent bands read well on a small profile chart (product choice, v1).
export const DEFAULT_BUCKET_COUNT = 5;

/** Partition picks into equal probability bands and measure the hit rate per band. */
export function calibrationBuckets(
  picks: readonly SettledPick[],
  bucketCount: number = DEFAULT_BUCKET_COUNT,
): CalibrationBucket[] {
  const safeCount = Math.max(1, Math.floor(bucketCount));
  const pickCounts = new Array<number>(safeCount).fill(0);
  const hitCounts = new Array<number>(safeCount).fill(0);
  const probabilitySums = new Array<number>(safeCount).fill(0);

  for (const pick of picks) {
    const clamped = Math.min(Math.max(pick.probabilityFraction, 0), 1);
    const bucketIndex = Math.min(Math.floor(clamped * safeCount), safeCount - 1);
    pickCounts[bucketIndex] = (pickCounts[bucketIndex] ?? 0) + 1;
    hitCounts[bucketIndex] = (hitCounts[bucketIndex] ?? 0) + (pick.outcome === 'hit' ? 1 : 0);
    probabilitySums[bucketIndex] = (probabilitySums[bucketIndex] ?? 0) + clamped;
  }

  const buckets: CalibrationBucket[] = [];
  for (let bucketIndex = 0; bucketIndex < safeCount; bucketIndex += 1) {
    const pickCount = pickCounts[bucketIndex] ?? 0;
    const hitCount = hitCounts[bucketIndex] ?? 0;
    const probabilitySum = probabilitySums[bucketIndex] ?? 0;
    buckets.push({
      lowerBoundFraction: bucketIndex / safeCount,
      upperBoundFraction: (bucketIndex + 1) / safeCount,
      pickCount,
      hitCount,
      averageProbabilityFraction: pickCount > 0 ? probabilitySum / pickCount : null,
      hitRateFraction: pickCount > 0 ? hitCount / pickCount : null,
    });
  }
  return buckets;
}
