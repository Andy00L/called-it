import type { OddsPayload } from '@calledit/txline';

export const MARKET_MATCH_RESULT = '1X2_PARTICIPANT_RESULT';

/** Parse a StablePrice percentage string ("55.804" or "NA") into a fraction in [0, 1]. */
export function parseStablePct(pct: string | undefined): number | null {
  if (pct === undefined || pct === 'NA') {
    return null;
  }
  const value = Number.parseFloat(pct);
  if (!Number.isFinite(value)) {
    return null;
  }
  return value / 100;
}

export interface MatchResultProbabilities {
  p1: number;
  draw: number;
  p2: number;
}

function indexForOutcome(names: readonly string[], outcome: 'p1' | 'draw' | 'p2'): number {
  const lower = names.map((name) => name.toLowerCase());
  if (outcome === 'draw') {
    const drawIndex = lower.findIndex((name) => name.includes('draw') || name === 'x');
    return drawIndex;
  }
  const digit = outcome === 'p1' ? '1' : '2';
  const other = outcome === 'p1' ? '2' : '1';
  const byName = lower.findIndex(
    (name) => (name.includes('part') || name.includes('team')) && name.includes(digit),
  );
  if (byName !== -1) {
    return byName;
  }
  return lower.findIndex((name) => name.includes(digit) && !name.includes(other));
}

/**
 * Extract de-margined match-result probabilities (1X2) from an odds snapshot.
 * Prefers the most recent record. Returns null if the market or its Pct is absent.
 */
export function readMatchResult(odds: readonly OddsPayload[]): MatchResultProbabilities | null {
  const candidates = odds
    .filter((record) => record.SuperOddsType === MARKET_MATCH_RESULT && record.Pct !== undefined)
    .sort((a, b) => b.Ts - a.Ts);

  for (const record of candidates) {
    const names = record.PriceNames;
    const pct = record.Pct;
    if (pct === undefined) {
      continue;
    }
    const positional: MatchResultProbabilities | null =
      names.length === 3
        ? { p1: parseStablePct(pct[0]) ?? -1, draw: parseStablePct(pct[1]) ?? -1, p2: parseStablePct(pct[2]) ?? -1 }
        : null;

    const i1 = indexForOutcome(names, 'p1');
    const iX = indexForOutcome(names, 'draw');
    const i2 = indexForOutcome(names, 'p2');
    const named =
      i1 !== -1 && iX !== -1 && i2 !== -1
        ? {
            p1: parseStablePct(pct[i1]),
            draw: parseStablePct(pct[iX]),
            p2: parseStablePct(pct[i2]),
          }
        : null;

    if (named !== null && named.p1 !== null && named.draw !== null && named.p2 !== null) {
      return { p1: named.p1, draw: named.draw, p2: named.p2 };
    }
    if (
      positional !== null &&
      positional.p1 >= 0 &&
      positional.draw >= 0 &&
      positional.p2 >= 0
    ) {
      return positional;
    }
  }
  return null;
}
