import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PickRecord } from '@calledit/contracts';
import {
  buildLeafPreimage,
  buildMerkleTree,
  createCommitmentBatcher,
  hashPickLeaf,
  verifyMerkleProof,
} from './commitments.js';
import { createMemoryPersistence } from './persistence-memory.js';

function makePick(id: string, lockedAtMs: number): PickRecord {
  return {
    id,
    playerId: 'player-1',
    fixtureId: 18188721,
    optionId: 'corner:5112-5712',
    category: 'corner',
    claim: 'Corner in the next 10 minutes',
    predicate: {
      kind: 'event_window',
      event: 'corner',
      team: 'either',
      fromClockSeconds: 5112,
      toClockSeconds: 5712,
    },
    probabilityFraction: 0.667,
    potentialPoints: 150,
    pricingSource: 'model',
    lockedAtMs,
    lockClockSeconds: 5112,
    isBookie: false,
    bookieOfPickId: null,
    status: 'pending',
  };
}

test('leaf preimage is canonical and versioned', () => {
  const preimage = buildLeafPreimage(makePick('pick-a', 1000));
  assert.ok(preimage.startsWith('calledit.pick.v1\n'));
  assert.equal(hashPickLeaf(makePick('pick-a', 1000)), hashPickLeaf(makePick('pick-a', 1000)));
  assert.notEqual(hashPickLeaf(makePick('pick-a', 1000)), hashPickLeaf(makePick('pick-b', 1000)));
});

test('merkle proofs verify for every leaf count', () => {
  for (const leafCount of [1, 2, 3, 5, 8]) {
    const leaves = Array.from({ length: leafCount }, (unusedValue, leafIndex) =>
      hashPickLeaf(makePick(`pick-${leafIndex}`, leafIndex)),
    );
    const tree = buildMerkleTree(leaves);
    for (let leafIndex = 0; leafIndex < leafCount; leafIndex += 1) {
      const leaf = leaves[leafIndex] ?? '';
      const proof = tree.proofs[leafIndex] ?? [];
      assert.equal(
        verifyMerkleProof(leaf, proof, tree.rootHex),
        true,
        `leaf ${leafIndex} of ${leafCount} must verify`,
      );
    }
  }
});

test('a tampered leaf fails verification', () => {
  const leaves = [hashPickLeaf(makePick('pick-0', 0)), hashPickLeaf(makePick('pick-1', 1))];
  const tree = buildMerkleTree(leaves);
  const tamperedLeaf = hashPickLeaf(makePick('pick-tampered', 0));
  assert.equal(verifyMerkleProof(tamperedLeaf, tree.proofs[0] ?? [], tree.rootHex), false);
});

test('batcher commits uncommitted picks once and skips empty runs', async () => {
  const persistence = createMemoryPersistence();
  const player = await persistence.createPlayer('tester', 'hash');
  assert.ok(player.ok);
  const pick = { ...makePick('batch-pick', 5), playerId: player.ok ? player.value.id : '' };
  const inserted = await persistence.insertPickPair(pick, null);
  assert.ok(inserted.ok);

  const postedRoots: string[] = [];
  const batcher = createCommitmentBatcher({
    persistence,
    postMemo: async (rootHex) => {
      postedRoots.push(rootHex);
      return { ok: true, txSig: `tx-${postedRoots.length}` };
    },
    nowMs: () => 42,
  });

  await batcher.runOnce();
  assert.equal(postedRoots.length, 1);

  // Second run: nothing left to commit, no new memo.
  await batcher.runOnce();
  assert.equal(postedRoots.length, 1);

  const receipt = await persistence.getReceipt('batch-pick');
  assert.ok(receipt.ok);
  const record = receipt.ok ? receipt.value : null;
  assert.notEqual(record, null);
  assert.equal(record?.commitment?.memoTxSig, 'tx-1');
  assert.equal(record?.leafIndex, 0);
  assert.equal(
    verifyMerkleProof(
      hashPickLeaf(pick),
      record?.proof ?? [],
      record?.commitment?.rootHashHex ?? '',
    ),
    true,
  );
});

test('batcher records nothing when the memo post fails', async () => {
  const persistence = createMemoryPersistence();
  const player = await persistence.createPlayer('tester', 'hash');
  assert.ok(player.ok);
  const pick = { ...makePick('fail-pick', 5), playerId: player.ok ? player.value.id : '' };
  await persistence.insertPickPair(pick, null);

  const batcher = createCommitmentBatcher({
    persistence,
    postMemo: async () => ({ ok: false, error: 'rpc down' }),
  });
  await batcher.runOnce();

  const receipt = await persistence.getReceipt('fail-pick');
  assert.ok(receipt.ok);
  assert.equal(receipt.ok ? receipt.value?.commitment : undefined, null);

  // The pick stays uncommitted and retries on the next tick.
  const uncommitted = await persistence.listUncommittedPicks();
  assert.ok(uncommitted.ok);
  assert.equal(uncommitted.ok ? uncommitted.value.length : 0, 1);
});

test('batcher without a wallet commits nothing', async () => {
  const persistence = createMemoryPersistence();
  const player = await persistence.createPlayer('tester', 'hash');
  assert.ok(player.ok);
  const pick = { ...makePick('dry-pick', 5), playerId: player.ok ? player.value.id : '' };
  await persistence.insertPickPair(pick, null);

  const batcher = createCommitmentBatcher({ persistence, postMemo: undefined });
  await batcher.runOnce();

  const uncommitted = await persistence.listUncommittedPicks();
  assert.ok(uncommitted.ok);
  assert.equal(uncommitted.ok ? uncommitted.value.length : 0, 1);
});
