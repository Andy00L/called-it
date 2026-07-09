import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateCalls, type CallOption } from '@calledit/engine';
import type { OddsPayload, ScoresUpdate } from '@calledit/txline';
import { createGameService, type SettlementNotice } from './game.js';
import { createMemoryPersistence } from './persistence-memory.js';
import {
  applyOddsPayload,
  applyScoresUpdate,
  createMatchStateStore,
  getMatchState,
  isInRunning,
  type MatchStateStore,
} from './state.js';

function buildOddsPayload(
  fixtureId: number,
  ts: number,
  pcts: [string, string, string],
): OddsPayload {
  return {
    FixtureId: fixtureId,
    MessageId: `odds-${ts}`,
    Ts: ts,
    Bookmaker: 'StablePrice',
    BookmakerId: 0,
    SuperOddsType: '1X2_PARTICIPANT_RESULT',
    InRunning: true,
    PriceNames: ['Participant1', 'Draw', 'Participant2'],
    Prices: [0, 0, 0],
    Pct: pcts,
  };
}

interface TestHarness {
  store: MatchStateStore;
  persistence: ReturnType<typeof createMemoryPersistence>;
  game: ReturnType<typeof createGameService>;
  notices: SettlementNotice[];
}

function createHarness(): TestHarness {
  const store = createMatchStateStore();
  const persistence = createMemoryPersistence();
  const notices: SettlementNotice[] = [];
  const game = createGameService({
    persistence,
    store,
    onSettlement: (notice) => notices.push(notice),
  });
  return { store, persistence, game, notices };
}

let nextTs = 1;
function pushScores(
  harness: TestHarness,
  update: Omit<ScoresUpdate, 'Ts'> & Partial<Pick<ScoresUpdate, 'Ts'>>,
): void {
  nextTs += 1;
  applyScoresUpdate(harness.store, { Ts: update.Ts ?? nextTs, ...update }, nextTs);
}

function primeLiveMatch(
  harness: TestHarness,
  fixtureId: number,
  clockSeconds: number,
  pcts: [string, string, string] = ['55.804', '34.710', '9.524'],
): void {
  pushScores(harness, {
    FixtureId: fixtureId,
    Action: 'kickoff',
    Clock: { Running: true, Seconds: clockSeconds },
  });
  nextTs += 1;
  applyOddsPayload(harness.store, buildOddsPayload(fixtureId, nextTs, pcts), nextTs);
}

function catalogFor(harness: TestHarness, fixtureId: number): CallOption[] {
  const state = getMatchState(harness.store, fixtureId);
  assert.ok(state !== undefined);
  return generateCalls({
    clockSeconds: state.clockSeconds,
    score: state.score,
    matchResult: state.matchResult,
    inRunning: isInRunning(state),
  });
}

function optionOf(options: readonly CallOption[], category: CallOption['category']): CallOption {
  const option = options.find((candidate) => candidate.category === category);
  assert.ok(option !== undefined, `no ${category} option in catalog`);
  return option;
}

async function createGuest(harness: TestHarness, handle = 'drew'): Promise<{
  playerId: string;
  playerToken: string;
}> {
  const created = await harness.game.createGuestPlayer(handle);
  assert.ok(created.ok);
  return { playerId: created.value.playerId, playerToken: created.value.playerToken };
}

test('guest creation validates the handle', async () => {
  const harness = createHarness();
  const tooShort = await harness.game.createGuestPlayer('x');
  assert.ok(!tooShort.ok && tooShort.error.startsWith('invalid_handle'));
  const created = await harness.game.createGuestPlayer('drew');
  assert.ok(created.ok);
  assert.ok(created.value.playerToken.length >= 64);
});

test('a player can rename their handle; auth and validation gate it', async () => {
  const harness = createHarness();
  const guest = await createGuest(harness, 'old name');

  const badToken = await harness.game.renameHandle(guest.playerId, 'wrong', 'newname');
  assert.ok(!badToken.ok && badToken.error === 'auth_failed');

  const badHandle = await harness.game.renameHandle(guest.playerId, guest.playerToken, '!');
  assert.ok(!badHandle.ok && badHandle.error.startsWith('invalid_handle'));

  const reserved = await harness.game.renameHandle(guest.playerId, guest.playerToken, 'The Bookie');
  assert.ok(!reserved.ok && reserved.error === 'invalid_handle: reserved name');

  const renamed = await harness.game.renameHandle(guest.playerId, guest.playerToken, ' fresh name ');
  assert.ok(renamed.ok);
  assert.equal(renamed.value.handle, 'fresh name');

  // The rename is visible everywhere the handle is read live.
  const player = await harness.persistence.getPlayer(guest.playerId);
  assert.ok(player.ok && player.value !== null);
  assert.equal(player.value.handle, 'fresh name');
});

test('lock rejects bad auth, unknown fixtures, and unknown options', async () => {
  const harness = createHarness();
  primeLiveMatch(harness, 100, 600);
  const guest = await createGuest(harness);

  const badToken = await harness.game.lockPick(guest.playerId, 'wrong', 100, 'anything');
  assert.ok(!badToken.ok && badToken.error === 'auth_failed');

  const badFixture = await harness.game.lockPick(guest.playerId, guest.playerToken, 999, 'x');
  assert.ok(!badFixture.ok && badFixture.error === 'unknown_fixture');

  const badOption = await harness.game.lockPick(guest.playerId, guest.playerToken, 100, 'nope');
  assert.ok(!badOption.ok && badOption.error === 'unknown_option');
});

test('lock refuses matches that are not in running', async () => {
  const harness = createHarness();
  nextTs += 1;
  applyOddsPayload(harness.store, buildOddsPayload(101, nextTs, ['50.000', '30.000', '20.000']), nextTs);
  const guest = await createGuest(harness);
  const locked = await harness.game.lockPick(guest.playerId, guest.playerToken, 101, 'x');
  assert.ok(!locked.ok && locked.error === 'not_in_running');
});

test('lock creates the ghost mirror and blocks a second pick in the category', async () => {
  const harness = createHarness();
  primeLiveMatch(harness, 102, 600);
  const guest = await createGuest(harness);
  const corner = optionOf(catalogFor(harness, 102), 'corner');

  const locked = await harness.game.lockPick(guest.playerId, guest.playerToken, 102, corner.id);
  assert.ok(locked.ok);
  assert.equal(locked.value.pick.playerId, guest.playerId);
  assert.ok(locked.value.bookiePick !== null);
  assert.equal(locked.value.bookiePick.playerId, null);
  assert.equal(locked.value.bookiePick.isBookie, true);
  assert.equal(locked.value.bookiePick.bookieOfPickId, locked.value.pick.id);

  const duplicate = await harness.game.lockPick(guest.playerId, guest.playerToken, 102, corner.id);
  assert.ok(!duplicate.ok && duplicate.error === 'duplicate_category');
});

test('hits award streaked points, misses reset the streak, ghost plays flat', async () => {
  const harness = createHarness();
  const fixtureId = 103;
  primeLiveMatch(harness, fixtureId, 600);
  const guest = await createGuest(harness);

  // 1st pick: corner in the next 10 minutes -> hit.
  const cornerOption = optionOf(catalogFor(harness, fixtureId), 'corner');
  const cornerLock = await harness.game.lockPick(
    guest.playerId,
    guest.playerToken,
    fixtureId,
    cornerOption.id,
  );
  assert.ok(cornerLock.ok);
  pushScores(harness, {
    FixtureId: fixtureId,
    Action: 'corner',
    Confirmed: true,
    Participant: 1,
    Clock: { Running: true, Seconds: 700 },
  });
  await harness.game.resolveFixture(fixtureId);

  let player = await harness.persistence.getPlayer(guest.playerId);
  assert.ok(player.ok && player.value !== null);
  assert.equal(player.value.totalPoints, cornerOption.potentialPoints);
  assert.equal(player.value.currentStreak, 1);

  // 2nd pick: card -> hit with the x1.1 streak multiplier; ghost stays flat.
  const cardOption = optionOf(catalogFor(harness, fixtureId), 'card');
  const cardLock = await harness.game.lockPick(
    guest.playerId,
    guest.playerToken,
    fixtureId,
    cardOption.id,
  );
  assert.ok(cardLock.ok);
  pushScores(harness, {
    FixtureId: fixtureId,
    Action: 'yellow_card',
    Confirmed: true,
    Participant: 2,
    Clock: { Running: true, Seconds: 800 },
  });
  await harness.game.resolveFixture(fixtureId);

  const expectedCardPoints = Math.round(cardOption.potentialPoints * 1.1);
  player = await harness.persistence.getPlayer(guest.playerId);
  assert.ok(player.ok && player.value !== null);
  assert.equal(player.value.totalPoints, cornerOption.potentialPoints + expectedCardPoints);
  assert.equal(player.value.currentStreak, 2);
  assert.equal(player.value.bestStreak, 2);

  // 3rd pick: goal before half-time -> clock passes the window, miss.
  const goalOption = optionOf(catalogFor(harness, fixtureId), 'goal');
  const goalLock = await harness.game.lockPick(
    guest.playerId,
    guest.playerToken,
    fixtureId,
    goalOption.id,
  );
  assert.ok(goalLock.ok);
  pushScores(harness, {
    FixtureId: fixtureId,
    Clock: { Running: true, Seconds: 2760 },
  });
  await harness.game.resolveFixture(fixtureId);

  player = await harness.persistence.getPlayer(guest.playerId);
  assert.ok(player.ok && player.value !== null);
  assert.equal(player.value.totalPoints, cornerOption.potentialPoints + expectedCardPoints);
  assert.equal(player.value.currentStreak, 0);
  assert.equal(player.value.bestStreak, 2);

  // Ghost settlements mirror the categories without any multiplier.
  const ghostViews = await harness.persistence.listSettledBookiePicksAgainstPlayer(guest.playerId);
  assert.ok(ghostViews.ok);
  const ghostPoints = ghostViews.value.reduce((sum, view) => sum + view.pointsAwarded, 0);
  assert.equal(ghostPoints, cornerOption.potentialPoints + cardOption.potentialPoints);

  // Profile math ties it together.
  const profile = await harness.game.profile(guest.playerId);
  assert.ok(profile.ok);
  assert.equal(profile.value.settledPickCount, 3);
  assert.equal(profile.value.bookie.playerPoints, cornerOption.potentialPoints + expectedCardPoints);
  assert.equal(profile.value.bookie.bookiePoints, ghostPoints);
  assert.equal(profile.value.bookie.marginPoints, expectedCardPoints - cardOption.potentialPoints);
  assert.ok(profile.value.edgeVsMarket !== null);
  assert.ok(profile.value.marketBrierScore !== null);
  assert.equal(profile.value.calibration.length, 5);

  // Leaderboards agree with the aggregates.
  const globalRows = await harness.game.leaderboardGlobal();
  assert.ok(globalRows.ok);
  assert.equal(globalRows.value[0]?.playerId, guest.playerId);
  const fixtureRows = await harness.game.leaderboardFixture(fixtureId);
  assert.ok(fixtureRows.ok);
  assert.equal(
    fixtureRows.value[0]?.fixturePoints,
    cornerOption.potentialPoints + expectedCardPoints,
  );

  // Every settlement emitted a notice (3 human + 3 ghost).
  assert.equal(harness.notices.length, 6);
});

test('a call cannot be locked with under 2 minutes left in its window', async () => {
  const harness = createHarness();
  // 79th minute: the underdog hold at 80' has only 60s left.
  primeLiveMatch(harness, 104, 79 * 60);
  const guest = await createGuest(harness);
  const probabilityOption = optionOf(catalogFor(harness, 104), 'probability');
  const locked = await harness.game.lockPick(
    guest.playerId,
    guest.playerToken,
    104,
    probabilityOption.id,
  );
  assert.ok(!locked.ok && locked.error === 'window_too_short');
});

test('probability holds resolve against the live market at the target clock', async () => {
  const missHarness = createHarness();
  // Underdog at 9.5%: below the 15% survival threshold at 80' -> miss.
  primeLiveMatch(missHarness, 105, 70 * 60);
  const missGuest = await createGuest(missHarness);
  const missOption = optionOf(catalogFor(missHarness, 105), 'probability');
  const missLock = await missHarness.game.lockPick(
    missGuest.playerId,
    missGuest.playerToken,
    105,
    missOption.id,
  );
  assert.ok(missLock.ok);
  pushScores(missHarness, { FixtureId: 105, Clock: { Running: true, Seconds: 80 * 60 + 5 } });
  await missHarness.game.resolveFixture(105);
  const missPlayer = await missHarness.persistence.getPlayer(missGuest.playerId);
  assert.ok(missPlayer.ok && missPlayer.value !== null);
  assert.equal(missPlayer.value.totalPoints, 0);

  const hitHarness = createHarness();
  // Underdog at 20%: above the threshold at 80' -> hit.
  primeLiveMatch(hitHarness, 106, 70 * 60, ['50.000', '30.000', '20.000']);
  const hitGuest = await createGuest(hitHarness);
  const hitOption = optionOf(catalogFor(hitHarness, 106), 'probability');
  const hitLock = await hitHarness.game.lockPick(
    hitGuest.playerId,
    hitGuest.playerToken,
    106,
    hitOption.id,
  );
  assert.ok(hitLock.ok);
  pushScores(hitHarness, { FixtureId: 106, Clock: { Running: true, Seconds: 80 * 60 + 5 } });
  await hitHarness.game.resolveFixture(106);
  const hitPlayer = await hitHarness.persistence.getPlayer(hitGuest.playerId);
  assert.ok(hitPlayer.ok && hitPlayer.value !== null);
  assert.equal(hitPlayer.value.totalPoints, hitOption.potentialPoints);
});

test('a finished match sweeps every remaining pick to its final verdict', async () => {
  const harness = createHarness();
  primeLiveMatch(harness, 107, 600);
  const guest = await createGuest(harness);
  const cornerOption = optionOf(catalogFor(harness, 107), 'corner');
  const locked = await harness.game.lockPick(
    guest.playerId,
    guest.playerToken,
    107,
    cornerOption.id,
  );
  assert.ok(locked.ok);

  // The feed ends the match (and zeroes the clock) without a corner.
  pushScores(harness, {
    FixtureId: 107,
    Action: 'clock_adjustment',
    Clock: { Running: false, Seconds: 0 },
  });
  pushScores(harness, { FixtureId: 107, Action: 'game_finalised' });
  await harness.game.resolveFixture(107);

  assert.equal(harness.game.pendingPickCount(), 0);
  const player = await harness.persistence.getPlayer(guest.playerId);
  assert.ok(player.ok && player.value !== null);
  assert.equal(player.value.totalPoints, 0);
  assert.equal(player.value.currentStreak, 0);
});
