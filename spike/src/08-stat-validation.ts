import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AnchorProvider, Program, Wallet, type Idl } from '@coral-xyz/anchor';
// Runtime import straight from bn.js: anchor's ESM surface does not expose BN.
import BN from 'bn.js';
import { Connection, PublicKey } from '@solana/web3.js';
import {
  decodeOracleBinary32,
  decodeOracleProof,
  fetchFixturesSnapshot,
  fetchScoresSnapshot,
  fetchScoresStatValidation,
  PDA_SEEDS,
  type DecodedProofNode,
  type OracleProofNode,
  type ScoresStatValidation,
  type ScoresUpdate,
  type SoccerPeriodScore,
  type SoccerTotalScore,
} from '@calledit/txline';
import { loadKeypair, readEnv, requireValue } from './env.js';

/**
 * Discovery runbook for GET /api/scores/stat-validation and the on-chain
 * Txoracle validate_stat instruction:
 *   1. find a finished fixture and its final scores event (max Ts with Score),
 *   2. probe stat keys (encoding: key = period * 1000 + base_key, sourceRef
 *      packages/txline/src/types.ts Stats comment) and label them by matching
 *      values against the known Score state,
 *   3. locate the daily_scores_roots PDA by trying seed layouts,
 *   4. run validate_stat(...).view() end to end, plus a negative check
 *      (threshold + 1 must return false).
 * Usage: pnpm --filter @calledit/spike statval [fixtureId]
 */

const env = readEnv();
const jwt = requireValue(env.jwt, 'TXLINE_JWT', 'Run: pnpm --filter @calledit/spike auth');
const apiToken = requireValue(
  env.apiToken,
  'TXLINE_API_TOKEN',
  'Run: pnpm --filter @calledit/spike activate',
);
const auth = { jwt, apiToken };

// Probe budget: base keys 1..10 across period prefixes 0, 1000, 2000
// (period ids are what we are discovering; the response echoes them back).
const PROBE_BASE_KEYS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const PROBE_PERIOD_PREFIXES = [0, 1000, 2000];

// Milliseconds per epoch day, for the daily roots PDA candidates.
const MS_PER_DAY = 86_400_000;

function describePeriodScore(label: string, period: SoccerPeriodScore | undefined): string {
  if (period === undefined) {
    return `${label}: none`;
  }
  return `${label}: goals=${period.Goals ?? 0} corners=${period.Corners ?? 0} yellow=${period.YellowCards ?? 0} red=${period.RedCards ?? 0}`;
}

function collectKnownValues(total: SoccerTotalScore | undefined): Map<string, number> {
  const known = new Map<string, number>();
  if (total === undefined) {
    return known;
  }
  for (const [periodName, periodScore] of Object.entries(total)) {
    const score = periodScore as SoccerPeriodScore;
    known.set(`${periodName}.Goals`, score.Goals ?? 0);
    known.set(`${periodName}.Corners`, score.Corners ?? 0);
    known.set(`${periodName}.YellowCards`, score.YellowCards ?? 0);
    known.set(`${periodName}.RedCards`, score.RedCards ?? 0);
  }
  return known;
}

function labelCandidates(value: number, known: Map<string, number>): string {
  const labels: string[] = [];
  for (const [name, knownValue] of known) {
    if (knownValue === value) {
      labels.push(name);
    }
  }
  return labels.length === 0 ? '(no Score match)' : labels.join(' | ');
}

/** Retry seam for a network path that drops connections in waves locally. */
async function withNetworkRetry<T>(label: string, run: () => Promise<T>): Promise<T> {
  const maxAttempts = 4;
  let lastCause: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await run();
    } catch (cause) {
      lastCause = cause;
      const messageText = cause instanceof Error ? cause.message : String(cause);
      console.warn(`[withNetworkRetry] ${label} attempt ${attempt}/${maxAttempts}: ${messageText.slice(0, 160)}`);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 3000));
    }
  }
  throw lastCause;
}

function decodeProofOrThrow(nodes: OracleProofNode[] | null, label: string): DecodedProofNode[] {
  const decoded = decodeOracleProof(nodes);
  if (decoded === null) {
    throw new Error(`[decodeProofOrThrow] ${label}: undecodable hash entry`);
  }
  return decoded;
}

async function findFinishedFixture(requestedFixtureId: number | null): Promise<{
  fixtureId: number;
  finalRecord: ScoresUpdate;
}> {
  const candidateIds: number[] = [];
  if (requestedFixtureId !== null) {
    candidateIds.push(requestedFixtureId);
  } else {
    const fixtures = await fetchFixturesSnapshot(env.cfg, auth);
    if (!fixtures.ok) {
      throw new Error(`[findFinishedFixture] fixtures snapshot failed: ${fixtures.error.message}`);
    }
    const nowMs = Date.now();
    const started = fixtures.value
      .filter((fixture) => fixture.StartTime < nowMs)
      .sort((left, right) => right.StartTime - left.StartTime);
    console.log(`[findFinishedFixture] ${started.length} started fixtures in the snapshot window`);
    for (const fixture of started.slice(0, 30)) {
      candidateIds.push(fixture.FixtureId);
    }
  }

  for (const fixtureId of candidateIds) {
    const snapshot = await fetchScoresSnapshot(env.cfg, auth, fixtureId);
    if (!snapshot.ok) {
      console.warn(`[findFinishedFixture] fixture ${fixtureId}: ${snapshot.error.message}`);
      continue;
    }
    const finalised = snapshot.value.some((record) => record.Action === 'game_finalised');
    const scoredCount = snapshot.value.filter((record) => record.Score !== undefined).length;
    const newest = snapshot.value.reduce(
      (max, record) => (record.Ts > max ? record.Ts : max),
      0,
    );
    console.log(
      `[findFinishedFixture] fixture ${fixtureId}: records=${snapshot.value.length} scored=${scoredCount} finalised=${finalised} newestTs=${newest}`,
    );
    if (!finalised) {
      continue;
    }
    let finalRecord: ScoresUpdate | undefined;
    for (const record of snapshot.value) {
      if (record.Score === undefined || record.Seq === undefined) {
        continue;
      }
      if (finalRecord === undefined || record.Ts > finalRecord.Ts) {
        finalRecord = record;
      }
    }
    if (finalRecord !== undefined) {
      return { fixtureId, finalRecord };
    }
  }
  throw new Error('[findFinishedFixture] no finished fixture with a scored record found');
}

async function main(): Promise<void> {
  const requestedFixtureId =
    process.argv[2] !== undefined ? Number.parseInt(process.argv[2], 10) : null;

  const { fixtureId, finalRecord } = await findFinishedFixture(requestedFixtureId);
  const seq = finalRecord.Seq ?? 0;
  console.log(`[main] fixture ${fixtureId}, final record Seq=${seq} Ts=${finalRecord.Ts} Action=${finalRecord.Action ?? '?'}`);
  console.log(`[main] ${describePeriodScore('P1 Total', finalRecord.Score?.Participant1?.Total)}`);
  console.log(`[main] ${describePeriodScore('P2 Total', finalRecord.Score?.Participant2?.Total)}`);

  const statsMap = finalRecord.Stats ?? {};
  const statsEntries = Object.entries(statsMap);
  if (statsEntries.length > 0) {
    console.log(`[main] Stats map present with ${statsEntries.length} entries (decoded):`);
    for (const [encodedKey, value] of statsEntries) {
      const key = Number.parseInt(encodedKey, 10);
      console.log(
        `  key=${key} period=${Math.floor(key / 1000)} base=${key % 1000} value=${value}`,
      );
    }
  } else {
    console.log('[main] Stats map empty on the final record (expected; probing instead)');
  }

  const knownP1 = collectKnownValues(finalRecord.Score?.Participant1);
  const knownP2 = collectKnownValues(finalRecord.Score?.Participant2);

  // Probe the validation endpoint key by key; the response echoes key,
  // value, and period, which is exactly the mapping we need.
  let sampleValidation: ScoresStatValidation | null = null;
  let sampleKey = 0;
  for (const prefix of PROBE_PERIOD_PREFIXES) {
    for (const baseKey of PROBE_BASE_KEYS) {
      const statKey = prefix + baseKey;
      const validation = await fetchScoresStatValidation(env.cfg, auth, {
        fixtureId,
        seq,
        statKey,
      });
      if (!validation.ok) {
        console.log(`  statKey=${statKey}: ${validation.error.code}`);
        continue;
      }
      const stat = validation.value.statToProve;
      console.log(
        `  statKey=${statKey} -> key=${stat.key} value=${stat.value} period=${stat.period}; P1 match: ${labelCandidates(stat.value, knownP1)}; P2 match: ${labelCandidates(stat.value, knownP2)}`,
      );
      if (sampleValidation === null) {
        sampleValidation = validation.value;
        sampleKey = statKey;
      }
    }
  }

  if (sampleValidation === null) {
    console.error('[main] no statKey probe succeeded; cannot continue to on-chain validation');
    process.exit(1);
  }

  console.log('[main] full sample response (statKey=' + String(sampleKey) + '):');
  console.log(JSON.stringify(sampleValidation, null, 2).slice(0, 4000));

  // On-chain: locate the daily scores roots PDA, then validate_stat .view().
  const keypair = loadKeypair(env.walletKeypairPath);
  const connection = new Connection(env.rpcUrl, 'confirmed');
  const provider = new AnchorProvider(connection, new Wallet(keypair), {
    commitment: 'confirmed',
  });
  const programId = new PublicKey(env.cfg.programId);
  const idlPath = resolve(import.meta.dirname, `../idl/txoracle.${env.cfg.network}.json`);
  if (!existsSync(idlPath)) {
    console.error(`[main] IDL missing at ${idlPath}`);
    process.exit(1);
  }
  const idl = JSON.parse(readFileSync(idlPath, 'utf8')) as Idl & { address?: string };
  if (idl.address === undefined) {
    idl.address = programId.toBase58();
  }
  const program = new Program(idl, provider);

  const epochDay = Math.floor(sampleValidation.ts / MS_PER_DAY);
  console.log(`[main] response ts=${sampleValidation.ts} -> epochDay=${epochDay}`);

  const seedBase = Buffer.from(PDA_SEEDS.dailyScoresRoots);
  const u32le = Buffer.alloc(4);
  u32le.writeUInt32LE(epochDay);
  const i64le = Buffer.alloc(8);
  i64le.writeBigInt64LE(BigInt(epochDay));
  const u16le = Buffer.alloc(2);
  u16le.writeUInt16LE(epochDay % 65536);
  const pdaCandidates: Array<{ label: string; seeds: Buffer[] }> = [
    { label: 'seed only', seeds: [seedBase] },
    { label: 'seed + u32le(epochDay)', seeds: [seedBase, u32le] },
    { label: 'seed + i64le(epochDay)', seeds: [seedBase, i64le] },
    { label: 'seed + utf8(epochDay)', seeds: [seedBase, Buffer.from(String(epochDay))] },
    { label: 'seed + u16le(epochDay)', seeds: [seedBase, u16le] },
  ];

  const foundPdas: Array<{ label: string; address: PublicKey }> = [];
  for (const candidate of pdaCandidates) {
    const [address] = PublicKey.findProgramAddressSync(candidate.seeds, programId);
    const info = await withNetworkRetry(`getAccountInfo ${candidate.label}`, () =>
      connection.getAccountInfo(address),
    );
    console.log(
      `[main] PDA ${candidate.label}: ${address.toBase58()} -> ${info === null ? 'no account' : `EXISTS (${info.data.length} bytes)`}`,
    );
    if (info !== null) {
      foundPdas.push({ label: candidate.label, address });
    }
  }
  if (foundPdas.length === 0) {
    console.error('[main] no daily_scores_roots PDA candidate exists; seed layout is different');
    process.exit(1);
  }

  const validateStatFactory = program.methods['validateStat'];
  if (validateStatFactory === undefined) {
    console.error('[main] IDL has no validateStat method');
    process.exit(1);
  }

  const summary = {
    fixtureId: new BN(sampleValidation.summary.fixtureId),
    updateStats: {
      updateCount: sampleValidation.summary.updateStats.updateCount,
      minTimestamp: new BN(sampleValidation.summary.updateStats.minTimestamp),
      maxTimestamp: new BN(sampleValidation.summary.updateStats.maxTimestamp),
    },
    eventsSubTreeRoot: decodeOracleBinary32(sampleValidation.summary.eventStatsSubTreeRoot),
  };
  if (summary.eventsSubTreeRoot === null) {
    console.error('[main] summary root not decodable as 32 bytes');
    process.exit(1);
  }
  const statEventRoot = decodeOracleBinary32(sampleValidation.eventStatRoot);
  if (statEventRoot === null) {
    console.error('[main] eventStatRoot not decodable as 32 bytes');
    process.exit(1);
  }
  const statA = {
    statToProve: {
      key: sampleValidation.statToProve.key,
      value: sampleValidation.statToProve.value,
      period: sampleValidation.statToProve.period,
    },
    eventStatRoot: statEventRoot,
    statProof: decodeProofOrThrow(sampleValidation.statProof, 'statProof'),
  };
  const fixtureProof = decodeProofOrThrow(sampleValidation.subTreeProof, 'subTreeProof');
  const mainTreeProof = decodeProofOrThrow(sampleValidation.mainTreeProof, 'mainTreeProof');

  for (const pda of foundPdas) {
    for (const check of [
      { label: 'EqualTo value (expect true)', threshold: sampleValidation.statToProve.value },
      { label: 'EqualTo value+1 (expect false)', threshold: sampleValidation.statToProve.value + 1 },
    ]) {
      try {
        const verdict = await withNetworkRetry(`view ${pda.label}`, async () =>
          (await validateStatFactory(
            new BN(sampleValidation.ts),
            summary,
            fixtureProof,
            mainTreeProof,
            { threshold: check.threshold, comparison: { equalTo: {} } },
            statA,
            null,
            null,
          )
            .accounts({ dailyScoresMerkleRoots: pda.address })
            .view()) as boolean,
        );
        console.log(`[main] view via ${pda.label} | ${check.label} -> ${verdict}`);
      } catch (cause) {
        const messageText = cause instanceof Error ? cause.message : String(cause);
        console.error(`[main] view via ${pda.label} | ${check.label} -> ERROR: ${messageText.slice(0, 300)}`);
      }
    }
  }
}

await main();
