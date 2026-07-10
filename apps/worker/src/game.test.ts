import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { generateCalls, type CallOption } from '@calledit/engine';
import { err, type OddsPayload, type ScoresUpdate } from '@calledit/txline';
import { createGameService, type SettlementNotice } from './game.js';
import { createMemoryPersistence } from './persistence-memory.js';
import type { PersistencePort } from './persistence.js';
import { createWalletVerifier } from './wallet-auth.js';
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
    walletVerifier: createWalletVerifier(),
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

test('guest creation refuses the reserved ghost name', async () => {
  const harness = createHarness();
  const titleCase = await harness.game.createGuestPlayer('The Bookie');
  assert.ok(!titleCase.ok && titleCase.error === 'invalid_handle: reserved name');
  const lowerCase = await harness.game.createGuestPlayer('the bookie');
  assert.ok(!lowerCase.ok && lowerCase.error === 'invalid_handle: reserved name');
});

test('concurrent settlements of one player across fixtures keep the streak exact', async () => {
  const harness = createHarness();
  primeLiveMatch(harness, 200, 600);
  primeLiveMatch(harness, 201, 600);
  const guest = await createGuest(harness);
  const cornerA = optionOf(catalogFor(harness, 200), 'corner');
  const cornerB = optionOf(catalogFor(harness, 201), 'corner');
  const lockA = await harness.game.lockPick(guest.playerId, guest.playerToken, 200, cornerA.id);
  const lockB = await harness.game.lockPick(guest.playerId, guest.playerToken, 201, cornerB.id);
  assert.ok(lockA.ok && lockB.ok);

  pushScores(harness, {
    FixtureId: 200,
    Action: 'corner',
    Confirmed: true,
    Participant: 1,
    Clock: { Running: true, Seconds: 700 },
  });
  pushScores(harness, {
    FixtureId: 201,
    Action: 'corner',
    Confirmed: true,
    Participant: 1,
    Clock: { Running: true, Seconds: 700 },
  });

  // Resolve both fixtures concurrently. Without per-player serialization both
  // settlements read streak 0, both write 1, and one increment is lost.
  await Promise.all([harness.game.resolveFixture(200), harness.game.resolveFixture(201)]);

  const player = await harness.persistence.getPlayer(guest.playerId);
  assert.ok(player.ok && player.value !== null);
  assert.equal(player.value.currentStreak, 2);
  assert.equal(player.value.bestStreak, 2);
});

test('a transient settlement failure keeps the pick pending for the next pass', async () => {
  const base = createMemoryPersistence();
  let failPickId: string | null = null;
  // Fail the human pick's first settle once, transiently (not "not pending").
  const persistence: PersistencePort = {
    ...base,
    settlePick: async (input) => {
      if (input.pickId === failPickId) {
        failPickId = null;
        return err('settle_pick failed: transient network blip');
      }
      return base.settlePick(input);
    },
  };
  const store = createMatchStateStore();
  const notices: SettlementNotice[] = [];
  const game = createGameService({
    persistence,
    store,
    walletVerifier: createWalletVerifier(),
    onSettlement: (notice) => notices.push(notice),
  });
  const harness: TestHarness = { store, persistence, game, notices };

  primeLiveMatch(harness, 300, 600);
  const guest = await createGuest(harness);
  const corner = optionOf(catalogFor(harness, 300), 'corner');
  const locked = await harness.game.lockPick(guest.playerId, guest.playerToken, 300, corner.id);
  assert.ok(locked.ok);
  failPickId = locked.value.pick.id;

  pushScores(harness, {
    FixtureId: 300,
    Action: 'corner',
    Confirmed: true,
    Participant: 1,
    Clock: { Running: true, Seconds: 700 },
  });

  // First pass: the human settle fails transiently, so the pick stays pending.
  await harness.game.resolveFixture(300);
  assert.equal(harness.game.pendingPickCount(), 1);
  let player = await harness.persistence.getPlayer(guest.playerId);
  assert.ok(player.ok && player.value !== null);
  assert.equal(player.value.totalPoints, 0);

  // Second pass: it retries and settles, points credited exactly once.
  await harness.game.resolveFixture(300);
  assert.equal(harness.game.pendingPickCount(), 0);
  player = await harness.persistence.getPlayer(guest.playerId);
  assert.ok(player.ok && player.value !== null);
  assert.equal(player.value.totalPoints, corner.potentialPoints);
});

function signChallenge(message: string, secretKey: Uint8Array): string {
  return Buffer.from(nacl.sign.detached(new TextEncoder().encode(message), secretKey)).toString(
    'base64',
  );
}

test('a player links a wallet, then restores the profile on a fresh token', async () => {
  const harness = createHarness();
  const guest = await createGuest(harness, 'wallet fan');
  const keyPair = nacl.sign.keyPair();
  const walletPubkey = new PublicKey(keyPair.publicKey).toBase58();

  const challenge = harness.game.issueWalletChallenge();
  const linked = await harness.game.linkWallet(
    guest.playerId,
    guest.playerToken,
    walletPubkey,
    challenge.nonce,
    signChallenge(challenge.message, keyPair.secretKey),
  );
  assert.ok(linked.ok && linked.value.walletPubkey === walletPubkey);

  const profile = await harness.game.profile(guest.playerId);
  assert.ok(profile.ok && profile.value.walletPubkey === walletPubkey);

  // Restore on a "new device": prove ownership, get the same player + new token.
  const restoreChallenge = harness.game.issueWalletChallenge();
  const restored = await harness.game.restoreWallet(
    walletPubkey,
    restoreChallenge.nonce,
    signChallenge(restoreChallenge.message, keyPair.secretKey),
  );
  assert.ok(restored.ok);
  assert.equal(restored.value.playerId, guest.playerId);
  assert.equal(restored.value.handle, 'wallet fan');
  assert.notEqual(restored.value.playerToken, guest.playerToken);

  // The rotated token authenticates; the old token no longer does.
  const withNew = await harness.game.renameHandle(
    guest.playerId,
    restored.value.playerToken,
    'new device name',
  );
  assert.ok(withNew.ok);
  const withOld = await harness.game.renameHandle(guest.playerId, guest.playerToken, 'nope');
  assert.ok(!withOld.ok && withOld.error === 'auth_failed');
});

test('a wallet already linked to another player is refused', async () => {
  const harness = createHarness();
  const first = await createGuest(harness, 'first');
  const second = await createGuest(harness, 'second');
  const keyPair = nacl.sign.keyPair();
  const walletPubkey = new PublicKey(keyPair.publicKey).toBase58();

  const firstChallenge = harness.game.issueWalletChallenge();
  const firstLink = await harness.game.linkWallet(
    first.playerId,
    first.playerToken,
    walletPubkey,
    firstChallenge.nonce,
    signChallenge(firstChallenge.message, keyPair.secretKey),
  );
  assert.ok(firstLink.ok);

  const secondChallenge = harness.game.issueWalletChallenge();
  const secondLink = await harness.game.linkWallet(
    second.playerId,
    second.playerToken,
    walletPubkey,
    secondChallenge.nonce,
    signChallenge(secondChallenge.message, keyPair.secretKey),
  );
  assert.ok(!secondLink.ok && secondLink.error === 'wallet_taken');
});

test('restoring an unlinked wallet and linking with a bad signature are distinct failures', async () => {
  const harness = createHarness();
  const guest = await createGuest(harness);
  const owner = nacl.sign.keyPair();
  const walletPubkey = new PublicKey(owner.publicKey).toBase58();

  const restoreChallenge = harness.game.issueWalletChallenge();
  const restore = await harness.game.restoreWallet(
    walletPubkey,
    restoreChallenge.nonce,
    signChallenge(restoreChallenge.message, owner.secretKey),
  );
  assert.ok(!restore.ok && restore.error === 'wallet_unlinked');

  const linkChallenge = harness.game.issueWalletChallenge();
  const forged = signChallenge(linkChallenge.message, nacl.sign.keyPair().secretKey);
  const badLink = await harness.game.linkWallet(
    guest.playerId,
    guest.playerToken,
    walletPubkey,
    linkChallenge.nonce,
    forged,
  );
  assert.ok(!badLink.ok && badLink.error === 'signature_mismatch');
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
