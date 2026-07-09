import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import type { ScoresUpdate } from '@calledit/txline';
import {
  extractEvents,
  resolveEventWindow,
  type EventWindowPredicate,
} from '@calledit/engine';
import type { LivePayload, SettlementNotice } from '@calledit/contracts';
import { appendTapeEntry, openTapeDeck, type TapeDeck } from './tape.js';
import { createReplayManager, type ReplayManager, type ReplayScheduler } from './replay.js';

/**
 * End-to-end Time Machine test over the same real capture the engine suite
 * uses (USA vs Bosnia, devnet SL1, 2026-07-02). The expected outcome of the
 * locked call is recomputed independently from the raw updates, so the test
 * asserts the replay pipeline agrees with the engine on real data.
 */

const scratchDirectory = mkdtempSync(join(tmpdir(), 'calledit-replay-'));

after(() => {
  rmSync(scratchDirectory, { recursive: true, force: true });
});

// Committed real capture; reused across packages instead of duplicating 100+ KB.
const fixtureUrl = new URL(
  '../../../packages/engine/src/__fixtures__/usa-bosnia-scores.json',
  import.meta.url,
);
const rawUpdates = JSON.parse(readFileSync(fixtureUrl, 'utf8')) as ScoresUpdate[];
// Tapes are arrival-ordered; the snapshot file is not, so order by emit Ts.
const orderedUpdates = [...rawUpdates].sort((left, right) => left.Ts - right.Ts);
const realFixtureId = orderedUpdates[0]?.FixtureId ?? 0;

/** Deterministic scheduler: steps run only when the test drains the queue. */
function createManualScheduler(): { scheduler: ReplayScheduler; stepOnce(): Promise<boolean> } {
  const queue: Array<() => void> = [];
  const flushAsync = (): Promise<void> => new Promise((resolvePromise) => setImmediate(resolvePromise));
  return {
    scheduler: {
      schedule: (run) => {
        queue.push(run);
        return () => {
          const index = queue.indexOf(run);
          if (index >= 0) {
            queue.splice(index, 1);
          }
        };
      },
    },
    stepOnce: async () => {
      const run = queue.shift();
      if (run === undefined) {
        return false;
      }
      run();
      // Let the async step (reducers, resolution, callbacks) settle fully.
      await flushAsync();
      await flushAsync();
      return true;
    },
  };
}

function writeRealTape(directoryName: string): TapeDeck {
  const deckResult = openTapeDeck(join(scratchDirectory, directoryName));
  assert.ok(deckResult.ok);
  for (const update of orderedUpdates) {
    const appended = appendTapeEntry(deckResult.value, realFixtureId, {
      receivedAtMs: update.Ts,
      stream: 'scores',
      payload: update,
    });
    assert.ok(appended.ok);
  }
  return deckResult.value;
}

interface ManagerHarness {
  manager: ReplayManager;
  stepOnce(): Promise<boolean>;
  payloads: LivePayload[];
  settlements: SettlementNotice[];
}

function createHarness(deck: TapeDeck, options?: { liveFixtureIds?: number[] }): ManagerHarness {
  const { scheduler, stepOnce } = createManualScheduler();
  const payloads: LivePayload[] = [];
  const settlements: SettlementNotice[] = [];
  const manager = createReplayManager({
    deck,
    listFixtures: () => [],
    isFixtureLive: (fixtureId) => options?.liveFixtureIds?.includes(fixtureId) ?? false,
    onState: (sessionId) => {
      const payload = manager.buildPayload(sessionId);
      if (payload !== null) {
        payloads.push(payload);
      }
    },
    onSettlement: (unusedSessionId, notice) => {
      settlements.push(notice);
    },
    scheduler,
  });
  return { manager, stepOnce, payloads, settlements };
}

test('a replayed match settles a locked call exactly as the engine says it should', async () => {
  const deck = writeRealTape('deck-real');
  const harness = createHarness(deck);
  try {
    const created = await harness.manager.createSession(realFixtureId, 60);
    assert.ok(created.ok);
    const sessionId = created.value.session.sessionId;

    // Play until the corner call shows up in the catalog, then lock it.
    let cornerOptionId: string | null = null;
    while (cornerOptionId === null) {
      const advanced = await harness.stepOnce();
      assert.ok(advanced, 'tape ended before any corner call was offered');
      const latest = harness.payloads.at(-1);
      const corner = latest?.catalog.find((option) => option.category === 'corner');
      if (corner !== undefined) {
        cornerOptionId = corner.id;
      }
    }
    const locked = await harness.manager.lockPick(sessionId, cornerOptionId);
    assert.ok(locked.ok);
    const pick = locked.value.pick;
    assert.equal(pick.predicate.kind, 'event_window');

    // Drain the tape to the end; the session must force final verdicts.
    while (await harness.stepOnce()) {
      // Draining; assertions follow.
    }
    const info = harness.manager.sessionInfo(sessionId);
    assert.ok(info.ok);
    assert.equal(info.value.finished, true);
    assert.equal(info.value.appliedEntries, info.value.totalEntries);

    // Independent expectation from the raw updates via the engine itself.
    const expectedOutcome = resolveEventWindow(
      pick.predicate as EventWindowPredicate,
      extractEvents(orderedUpdates),
      Number.MAX_SAFE_INTEGER,
    );
    assert.notEqual(expectedOutcome, 'pending');
    const humanSettlement = harness.settlements.find(
      (notice) => notice.pick.id === pick.id,
    );
    assert.ok(humanSettlement, 'the locked pick never settled');
    assert.equal(humanSettlement.outcome, expectedOutcome);

    // Session scoring stays internal: the profile sees exactly one settled pick.
    const profile = await harness.manager.profile(sessionId);
    assert.ok(profile.ok);
    assert.equal(profile.value.settledPickCount, 1);
  } finally {
    harness.manager.stopAll();
  }
});

test('replay latency reports the historical feed latency, not replay timing', async () => {
  const deck = writeRealTape('deck-latency');
  const harness = createHarness(deck);
  try {
    const created = await harness.manager.createSession(realFixtureId, 60);
    assert.ok(created.ok);
    await harness.stepOnce();
    const payload = harness.payloads.at(-1);
    assert.ok(payload);
    // receivedAtMs was set equal to Ts when writing the tape: latency 0.
    assert.equal(payload.latency.scores?.lastMs, 0);
  } finally {
    harness.manager.stopAll();
  }
});

test('session capacity is enforced with a distinct error', async () => {
  const deck = writeRealTape('deck-capacity');
  const harness = createHarness(deck);
  try {
    for (let index = 0; index < 6; index += 1) {
      const created = await harness.manager.createSession(realFixtureId, 10);
      assert.ok(created.ok);
    }
    const overflow = await harness.manager.createSession(realFixtureId, 10);
    assert.equal(overflow.ok, false);
    if (!overflow.ok) {
      assert.equal(overflow.error, 'replay_capacity');
    }
  } finally {
    harness.manager.stopAll();
  }
});

test('invalid speeds and unknown sessions produce distinct errors', async () => {
  const deck = writeRealTape('deck-validation');
  const harness = createHarness(deck);
  try {
    const badSpeed = await harness.manager.createSession(realFixtureId, 2);
    assert.equal(badSpeed.ok, false);
    if (!badSpeed.ok) {
      assert.ok(badSpeed.error.startsWith('invalid_speed'));
    }
    const missing = harness.manager.sessionInfo('nope');
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.error, 'unknown_session');
    }
    const lockMissing = await harness.manager.lockPick('nope', 'whatever');
    assert.equal(lockMissing.ok, false);
    if (!lockMissing.ok) {
      assert.equal(lockMissing.error, 'unknown_session');
    }
  } finally {
    harness.manager.stopAll();
  }
});

test('listTapes excludes stubs and fixtures that are still live', async () => {
  const deck = writeRealTape('deck-list');
  // A tiny stub tape: below the replayable size floor.
  const stubAppend = appendTapeEntry(deck, 777, {
    receivedAtMs: 1,
    stream: 'scores',
    payload: { FixtureId: 777, Ts: 1 },
  });
  assert.ok(stubAppend.ok);

  const harness = createHarness(deck);
  try {
    const listed = harness.manager.listTapes();
    assert.ok(listed.ok);
    assert.deepEqual(
      listed.value.map((tape) => tape.fixtureId),
      [realFixtureId],
    );
  } finally {
    harness.manager.stopAll();
  }

  const liveHarness = createHarness(deck, { liveFixtureIds: [realFixtureId] });
  try {
    const listed = liveHarness.manager.listTapes();
    assert.ok(listed.ok);
    assert.equal(listed.value.length, 0);
  } finally {
    liveHarness.manager.stopAll();
  }
});

test('a session cannot be created while the fixture is still live', async () => {
  const deck = writeRealTape('deck-live-guard');
  const harness = createHarness(deck, { liveFixtureIds: [realFixtureId] });
  try {
    const created = await harness.manager.createSession(realFixtureId, 10);
    assert.equal(created.ok, false);
    if (!created.ok) {
      assert.equal(created.error, 'fixture_still_live');
    }
  } finally {
    harness.manager.stopAll();
  }
});
