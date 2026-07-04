import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeBookieMargin, pickBookieDeck, pickBookieOption } from './bookie.js';
import type { CallOption } from './catalog.js';
import type { SettledPick } from './points.js';

function buildOption(
  id: string,
  category: CallOption['category'],
  probabilityFraction: number,
): CallOption {
  return {
    id,
    category,
    label: id,
    predicate: {
      kind: 'event_window',
      event: 'corner',
      team: 'either',
      fromClockSeconds: 0,
      toClockSeconds: 600,
    },
    probabilityFraction,
    potentialPoints: Math.round(100 / probabilityFraction),
    pricingSource: 'model',
  };
}

test('pickBookieOption takes the market favorite within the category', () => {
  const options = [
    buildOption('corner:low', 'corner', 0.35),
    buildOption('corner:high', 'corner', 0.68),
    buildOption('goal:either', 'goal', 0.9),
  ];
  const favorite = pickBookieOption(options, 'corner');
  assert.equal(favorite?.id, 'corner:high');
});

test('pickBookieOption ignores other categories and returns null when absent', () => {
  const options = [buildOption('goal:either', 'goal', 0.9)];
  assert.equal(pickBookieOption(options, 'card'), null);
});

test('pickBookieOption tie-breaks deterministically on the smaller id', () => {
  const options = [
    buildOption('corner:b', 'corner', 0.5),
    buildOption('corner:a', 'corner', 0.5),
  ];
  assert.equal(pickBookieOption(options, 'corner')?.id, 'corner:a');
});

test('pickBookieDeck returns one favorite per category present', () => {
  const options = [
    buildOption('corner:low', 'corner', 0.35),
    buildOption('corner:high', 'corner', 0.68),
    buildOption('goal:either', 'goal', 0.42),
    buildOption('card:either', 'card', 0.51),
  ];
  const deck = pickBookieDeck(options);
  assert.deepEqual(
    deck.map((option) => option.id),
    ['corner:high', 'goal:either', 'card:either'],
  );
});

test('computeBookieMargin scores player versus ghost', () => {
  const playerPicks: SettledPick[] = [
    { probabilityFraction: 0.12, outcome: 'hit', pointsAwarded: 833 },
    { probabilityFraction: 0.4, outcome: 'miss', pointsAwarded: 0 },
  ];
  const bookiePicks: SettledPick[] = [
    { probabilityFraction: 0.68, outcome: 'hit', pointsAwarded: 147 },
    { probabilityFraction: 0.9, outcome: 'hit', pointsAwarded: 111 },
  ];
  const margin = computeBookieMargin(playerPicks, bookiePicks);
  assert.equal(margin.playerPoints, 833);
  assert.equal(margin.bookiePoints, 258);
  assert.equal(margin.marginPoints, 575);
});
