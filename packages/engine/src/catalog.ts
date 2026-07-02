import type { SoccerFixtureScore } from '@calledit/txline';
import type { CallPredicate, EventKind } from './calls.js';
import type { MatchResultProbabilities } from './odds.js';
import { pointsForProbability } from './points.js';

const HALF_TIME_SECONDS = 45 * 60;

/**
 * Poisson rates per minute for a top-flight soccer match. Transparent v1 constants,
 * to be refined against captured World Cup data. Used to price micro-event calls when
 * the market does not directly quote them.
 */
export interface RateModel {
  cornersPerMinute: number;
  goalsPerMinute: number;
  cardsPerMinute: number;
}

export const DEFAULT_RATES: RateModel = {
  cornersPerMinute: 0.11,
  goalsPerMinute: 0.03,
  cardsPerMinute: 0.044,
};

/** Probability of at least one event in a window, from a per-minute Poisson rate. */
export function probabilityWithin(ratePerMinute: number, minutes: number): number {
  if (ratePerMinute <= 0 || minutes <= 0) {
    return 0;
  }
  return 1 - Math.exp(-ratePerMinute * minutes);
}

export type CallCategory = 'goal' | 'corner' | 'card' | 'probability';

export interface CallOption {
  id: string;
  category: CallCategory;
  label: string;
  predicate: CallPredicate;
  /** Market or model implied probability at generation time, fraction in (0, 1]. */
  probabilityFraction: number;
  /** Base points for a hit, before any streak multiplier. */
  potentialPoints: number;
  pricingSource: 'market' | 'model';
}

export interface CatalogState {
  clockSeconds: number;
  score: SoccerFixtureScore | undefined;
  matchResult: MatchResultProbabilities | null;
  /** True when the match is live and the clock is running. */
  inRunning: boolean;
}

function rateFor(kind: EventKind, rates: RateModel): number {
  if (kind === 'goal') {
    return rates.goalsPerMinute;
  }
  if (kind === 'corner') {
    return rates.cornersPerMinute;
  }
  return rates.cardsPerMinute;
}

function windowCall(
  kind: EventKind,
  category: CallCategory,
  label: string,
  fromClockSeconds: number,
  toClockSeconds: number,
  rates: RateModel,
): CallOption {
  const minutes = (toClockSeconds - fromClockSeconds) / 60;
  const probabilityFraction = probabilityWithin(rateFor(kind, rates), minutes);
  return {
    id: `${kind}:${fromClockSeconds}-${toClockSeconds}`,
    category,
    label,
    predicate: { kind: 'event_window', event: kind, team: 'either', fromClockSeconds, toClockSeconds },
    probabilityFraction,
    potentialPoints: pointsForProbability(probabilityFraction),
    pricingSource: 'model',
  };
}

/**
 * Generate the calls currently offerable for a live match. Micro-event windows are
 * priced by the Poisson model; the probability-hold call is priced by the live market.
 */
export function generateCalls(state: CatalogState, rates: RateModel = DEFAULT_RATES): CallOption[] {
  if (!state.inRunning) {
    return [];
  }
  const now = state.clockSeconds;
  const options: CallOption[] = [];

  options.push(
    windowCall('corner', 'corner', 'Corner in the next 10 minutes', now, now + 600, rates),
  );
  options.push(
    windowCall('card', 'card', 'A card in the next 15 minutes', now, now + 900, rates),
  );

  if (now < HALF_TIME_SECONDS) {
    options.push(
      windowCall('goal', 'goal', 'Goal before half-time', now, HALF_TIME_SECONDS, rates),
    );
  } else {
    options.push(
      windowCall('goal', 'goal', 'Goal in the next 15 minutes', now, now + 900, rates),
    );
  }

  const result = state.matchResult;
  if (result !== null && now <= 80 * 60) {
    const underdogIsP1 = result.p1 <= result.p2;
    const underdogFraction = underdogIsP1 ? result.p1 : result.p2;
    if (underdogFraction > 0) {
      options.push({
        id: `prob_hold:${underdogIsP1 ? 'p1' : 'p2'}:80`,
        category: 'probability',
        label: `Underdog still alive at 80'`,
        predicate: {
          kind: 'prob_hold',
          team: underdogIsP1 ? 'p1' : 'p2',
          minProbabilityFraction: 0.15,
          atClockSeconds: 80 * 60,
        },
        probabilityFraction: underdogFraction,
        potentialPoints: pointsForProbability(underdogFraction),
        pricingSource: 'market',
      });
    }
  }

  return options;
}
