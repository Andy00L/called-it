import assert from 'node:assert/strict';
import { test } from 'node:test';
import { err, ok, type ScoresStatValidation, type ScoresUpdate } from '@calledit/txline';
import { createSharedAuth } from './ingest.js';
import { createOracleVerifier, type OracleViewArgs } from './oracle-verify.js';

/** All-zero 32-byte roots and hashes are fine: the view seam never hashes. */
const bytes32 = (): number[] => new Array<number>(32).fill(0);

const FINAL_RECORD: ScoresUpdate = {
  FixtureId: 18188721,
  Ts: 1783206890273,
  Seq: 964,
  Action: 'game_finalised',
  Score: { Participant1: { Total: { Corners: 2 } }, Participant2: { Total: { Corners: 12 } } },
};

function buildValidation(p1Value: number, p2Value: number): ScoresStatValidation {
  return {
    ts: FINAL_RECORD.Ts,
    statToProve: { key: 7, value: p1Value, period: 100 },
    statToProve2: { key: 8, value: p2Value, period: 100 },
    eventStatRoot: bytes32(),
    summary: {
      fixtureId: FINAL_RECORD.FixtureId,
      updateStats: { updateCount: 964, minTimestamp: 1, maxTimestamp: FINAL_RECORD.Ts },
      eventStatsSubTreeRoot: bytes32(),
    },
    statProof: [{ hash: bytes32(), isRightSibling: true }],
    statProof2: [{ hash: bytes32(), isRightSibling: false }],
    subTreeProof: [{ hash: bytes32(), isRightSibling: true }],
    mainTreeProof: [{ hash: bytes32(), isRightSibling: false }],
  };
}

interface HarnessOptions {
  runView?: (args: OracleViewArgs) => Promise<boolean>;
  validationResult?: ReturnType<typeof ok<ScoresStatValidation>> | ReturnType<typeof err>;
  snapshotRecords?: ScoresUpdate[];
}

function buildHarness(options?: HarnessOptions) {
  const counters = { snapshotCalls: 0, validationCalls: 0, viewCalls: 0 };
  const viewArgsSeen: OracleViewArgs[] = [];
  const verifier = createOracleVerifier({
    cfg: {
      network: 'mainnet',
      apiOrigin: '',
      apiBaseUrl: '',
      programId: '9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA',
      txlMint: '',
      usdtMint: '',
      defaultRpcUrl: '',
    },
    sharedAuth: createSharedAuth({ jwt: 'jwt', apiToken: 'token' }),
    rpcUrl: 'http://unused.local',
    walletSecret: new Uint8Array(64),
    fetchSnapshot: async () => {
      counters.snapshotCalls += 1;
      return ok(options?.snapshotRecords ?? [FINAL_RECORD]);
    },
    fetchValidation: async (unusedCfg, unusedAuth, query) => {
      counters.validationCalls += 1;
      if (options?.validationResult !== undefined) {
        return options.validationResult as ReturnType<typeof ok<ScoresStatValidation>>;
      }
      // Values keyed off the base keys so card pairs differ from corners.
      return ok(buildValidation(query.statKey, query.statKey2 ?? -1));
    },
    runView: async (args) => {
      counters.viewCalls += 1;
      viewArgsSeen.push(args);
      return options?.runView === undefined ? true : options.runView(args);
    },
  });
  return { verifier, counters, viewArgsSeen };
}

test('a corner category verifies on-chain and reports the proven finals', async () => {
  const harness = buildHarness();
  const verification = await harness.verifier.verifyCategory(18188721, 'corner');
  assert.equal(verification.status, 'verified');
  assert.deepEqual(verification.provenFinals, [{ label: 'corners', p1: 7, p2: 8 }]);
  assert.equal(verification.eventSeq, 964);
  assert.equal(harness.counters.viewCalls, 1);
  // The threshold must be the sum the predicate checks (Add + EqualTo).
  assert.equal(harness.viewArgsSeen[0]?.threshold, 15);
});

test('verified verdicts are cached per fixture and category', async () => {
  const harness = buildHarness();
  await harness.verifier.verifyCategory(18188721, 'corner');
  await harness.verifier.verifyCategory(18188721, 'corner');
  assert.equal(harness.counters.snapshotCalls, 1);
  assert.equal(harness.counters.viewCalls, 1);
});

test('card categories prove yellow and red pairs with two view calls', async () => {
  const harness = buildHarness();
  const verification = await harness.verifier.verifyCategory(18188721, 'card');
  assert.equal(verification.status, 'verified');
  assert.equal(harness.counters.viewCalls, 2);
  assert.deepEqual(
    verification.provenFinals?.map((final) => final.label),
    ['yellow cards', 'red cards'],
  );
});

test('a false on-chain verdict surfaces as mismatch', async () => {
  const harness = buildHarness({ runView: async () => false });
  const verification = await harness.verifier.verifyCategory(18188721, 'corner');
  assert.equal(verification.status, 'mismatch');
  assert.ok(verification.reason?.startsWith('on_chain_false'));
});

test('a missing daily root account reads as pending', async () => {
  const harness = buildHarness({
    runView: async () => {
      throw new Error('Account does not exist or has no data CdrFdc...');
    },
  });
  const verification = await harness.verifier.verifyCategory(18188721, 'corner');
  assert.equal(verification.status, 'pending');
  assert.equal(verification.reason, 'daily_root_not_posted');
});

test('a proof fetch failure reads as unavailable with a distinct reason', async () => {
  const harness = buildHarness({
    validationResult: err({ code: 'http_error', message: 'boom' }),
  });
  const verification = await harness.verifier.verifyCategory(18188721, 'corner');
  assert.equal(verification.status, 'unavailable');
  assert.ok(verification.reason?.startsWith('proof_fetch_failed'));
});

test('probability picks are declared out of scope, without any fetch', async () => {
  const harness = buildHarness();
  const verification = await harness.verifier.verifyCategory(18188721, 'probability');
  assert.equal(verification.status, 'unavailable');
  assert.equal(verification.reason, 'market_priced_pick');
  assert.equal(harness.counters.snapshotCalls, 0);
});

test('a snapshot without any scored record reads as unavailable', async () => {
  const harness = buildHarness({ snapshotRecords: [{ FixtureId: 1, Ts: 5 }] });
  const verification = await harness.verifier.verifyCategory(1, 'goal');
  assert.equal(verification.status, 'unavailable');
  assert.equal(verification.reason, 'no_scored_record');
});
