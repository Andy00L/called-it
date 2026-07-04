import type { CallCategory, CallOption } from './catalog.js';
import { sumAwardedPoints, type SettledPick } from './points.js';

/**
 * The Bookie: a deterministic ghost opponent that always locks the market
 * favorite. When the player locks a call in a category, the ghost locks the
 * highest-probability option of the same category deck at the same moment.
 * Beating The Bookie therefore means beating the market's own pricing, which
 * is the skill claim the product makes. No randomness anywhere: the same
 * catalog always produces the same ghost picks, so replays are reproducible.
 */

/** The option The Bookie locks for one category: the market favorite. */
export function pickBookieOption(
  options: readonly CallOption[],
  category: CallCategory,
): CallOption | null {
  let favorite: CallOption | null = null;
  for (const option of options) {
    if (option.category !== category) {
      continue;
    }
    if (favorite === null || option.probabilityFraction > favorite.probabilityFraction) {
      favorite = option;
      continue;
    }
    // Deterministic tie-break: equal probability resolves to the smaller id.
    if (option.probabilityFraction === favorite.probabilityFraction && option.id < favorite.id) {
      favorite = option;
    }
  }
  return favorite;
}

/** The Bookie's full deck: the favorite of every category present in the catalog. */
export function pickBookieDeck(options: readonly CallOption[]): CallOption[] {
  const categoriesSeen: CallCategory[] = [];
  for (const option of options) {
    if (!categoriesSeen.includes(option.category)) {
      categoriesSeen.push(option.category);
    }
  }
  const deck: CallOption[] = [];
  for (const category of categoriesSeen) {
    const favorite = pickBookieOption(options, category);
    if (favorite !== null) {
      deck.push(favorite);
    }
  }
  return deck;
}

export interface BookieMargin {
  playerPoints: number;
  bookiePoints: number;
  /** playerPoints minus bookiePoints. Positive means the player beat the market. */
  marginPoints: number;
}

/** Score the player against The Bookie over both settled slates. */
export function computeBookieMargin(
  playerPicks: readonly SettledPick[],
  bookiePicks: readonly SettledPick[],
): BookieMargin {
  const playerPoints = sumAwardedPoints(playerPicks);
  const bookiePoints = sumAwardedPoints(bookiePicks);
  return { playerPoints, bookiePoints, marginPoints: playerPoints - bookiePoints };
}
