import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AnchorProvider, Program, Wallet, type Idl } from '@coral-xyz/anchor';
// Runtime import straight from bn.js: anchor's ESM surface does not expose BN.
import BN from 'bn.js';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
  decodeOracleBinary32,
  decodeOracleProof,
  fetchScoresSnapshot,
  fetchScoresStatValidation,
  ORACLE_MS_PER_DAY,
  ORACLE_STAT_BASE_KEYS,
  PDA_SEEDS,
  type DecodedProofNode,
  type Result,
  type ScoresStatValidation,
  type ScoresUpdate,
  type StatValidationQuery,
  type TxlineNetworkConfig,
} from '@calledit/txline';
// Result is used by the fetch seam signatures below.
import type { CallCategory, OracleProvenFinal, OracleVerification } from '@calledit/contracts';
import { refreshGuestJwt, type SharedAuth } from './ingest.js';

/**
 * Oracle cross-check for receipts: prove that the fixture's final stats (the
 * data our settlement relied on) recompute to true against TxODDS's own daily
 * Merkle root on Solana, via Txoracle validate_stat .view() (read-only, free).
 * Discovery record: spike/src/08-stat-validation.ts and the execution plan.
 */

// Cache lifetimes: a verified or mismatch verdict is final for the process
// lifetime; transient states retry on a short fuse.
const TRANSIENT_CACHE_TTL_MS = 5 * 60 * 1000;

// One stat pair proven per view call: p1 base + p2 base, summed (Add) and
// compared EqualTo the total the API itself reported.
interface StatPairSpec {
  label: string;
  p1BaseKey: number;
  p2BaseKey: number;
}

// sourceRef: base key table discovered in spike/src/08-stat-validation.ts.
const PAIRS_BY_CATEGORY: Partial<Record<CallCategory, StatPairSpec[]>> = {
  goal: [
    {
      label: 'goals',
      p1BaseKey: ORACLE_STAT_BASE_KEYS.goalsP1,
      p2BaseKey: ORACLE_STAT_BASE_KEYS.goalsP2,
    },
  ],
  corner: [
    {
      label: 'corners',
      p1BaseKey: ORACLE_STAT_BASE_KEYS.cornersP1,
      p2BaseKey: ORACLE_STAT_BASE_KEYS.cornersP2,
    },
  ],
  card: [
    {
      label: 'yellow cards',
      p1BaseKey: ORACLE_STAT_BASE_KEYS.yellowCardsP1,
      p2BaseKey: ORACLE_STAT_BASE_KEYS.yellowCardsP2,
    },
    {
      label: 'red cards',
      p1BaseKey: ORACLE_STAT_BASE_KEYS.redCardsP1,
      p2BaseKey: ORACLE_STAT_BASE_KEYS.redCardsP2,
    },
  ],
};

export interface OracleViewArgs {
  ts: number;
  summary: {
    fixtureId: number;
    updateCount: number;
    minTimestamp: number;
    maxTimestamp: number;
    eventsSubTreeRoot: number[];
  };
  fixtureProof: DecodedProofNode[];
  mainTreeProof: DecodedProofNode[];
  /** EqualTo threshold checked against statA + statB (Add). */
  threshold: number;
  statA: { key: number; value: number; period: number; eventStatRoot: number[]; statProof: DecodedProofNode[] };
  statB: { key: number; value: number; period: number; eventStatRoot: number[]; statProof: DecodedProofNode[] };
}

export interface OracleVerifierDeps {
  cfg: TxlineNetworkConfig;
  sharedAuth: SharedAuth;
  rpcUrl: string;
  /** Provider wallet for the read-only view; no transaction is ever sent. */
  walletSecret: Uint8Array;
  nowMs?: () => number;
  /** Test seams; production uses the real client and Anchor. */
  fetchSnapshot?: (
    cfg: TxlineNetworkConfig,
    auth: { jwt: string; apiToken: string },
    fixtureId: number,
  ) => Promise<Result<ScoresUpdate[]>>;
  fetchValidation?: (
    cfg: TxlineNetworkConfig,
    auth: { jwt: string; apiToken: string },
    query: StatValidationQuery,
  ) => Promise<Result<ScoresStatValidation>>;
  runView?: (args: OracleViewArgs) => Promise<boolean>;
}

export interface OracleVerifier {
  verifyCategory(fixtureId: number, category: CallCategory): Promise<OracleVerification>;
}

/** True when a view failure means the daily root PDA does not exist yet. */
function isMissingRootAccountError(messageText: string): boolean {
  const lowered = messageText.toLowerCase();
  return lowered.includes('could not find') || lowered.includes('account does not exist');
}

function buildAnchorView(deps: OracleVerifierDeps): (args: OracleViewArgs) => Promise<boolean> {
  // Lazy init: the connection and program are built on first use so a worker
  // that never serves a settled receipt never touches the RPC.
  let program: Program | null = null;
  let programId: PublicKey | null = null;

  const ensureProgram = (): Program => {
    if (program !== null) {
      return program;
    }
    const connection = new Connection(deps.rpcUrl, 'confirmed');
    const keypair = Keypair.fromSecretKey(deps.walletSecret);
    const provider = new AnchorProvider(connection, new Wallet(keypair), {
      commitment: 'confirmed',
    });
    programId = new PublicKey(deps.cfg.programId);
    // The mainnet IDL is not on-chain; the committed local copy is the only
    // source (sourceRef: spike/idl/txoracle.mainnet.json, spike/README.md).
    const idlPath = resolve(
      import.meta.dirname,
      `../../../spike/idl/txoracle.${deps.cfg.network}.json`,
    );
    if (!existsSync(idlPath)) {
      throw new Error(`IDL missing at ${idlPath}`);
    }
    const idl = JSON.parse(readFileSync(idlPath, 'utf8')) as Idl & { address?: string };
    if (idl.address === undefined) {
      idl.address = programId.toBase58();
    }
    program = new Program(idl, provider);
    return program;
  };

  return async (args) => {
    const anchorProgram = ensureProgram();
    if (programId === null) {
      throw new Error('program id not initialized');
    }
    const validateStatFactory = anchorProgram.methods['validateStat'];
    if (validateStatFactory === undefined) {
      throw new Error('IDL has no validateStat method');
    }
    const epochDay = Math.floor(args.ts / ORACLE_MS_PER_DAY);
    // PDA layout discovered empirically: seed + u16le(epochDay).
    const epochDayLe = Buffer.alloc(2);
    epochDayLe.writeUInt16LE(epochDay % 65536);
    const [dailyRootsPda] = PublicKey.findProgramAddressSync(
      [Buffer.from(PDA_SEEDS.dailyScoresRoots), epochDayLe],
      programId,
    );
    return (await validateStatFactory(
      new BN(args.ts),
      {
        fixtureId: new BN(args.summary.fixtureId),
        updateStats: {
          updateCount: args.summary.updateCount,
          minTimestamp: new BN(args.summary.minTimestamp),
          maxTimestamp: new BN(args.summary.maxTimestamp),
        },
        eventsSubTreeRoot: args.summary.eventsSubTreeRoot,
      },
      args.fixtureProof,
      args.mainTreeProof,
      { threshold: args.threshold, comparison: { equalTo: {} } },
      {
        statToProve: { key: args.statA.key, value: args.statA.value, period: args.statA.period },
        eventStatRoot: args.statA.eventStatRoot,
        statProof: args.statA.statProof,
      },
      {
        statToProve: { key: args.statB.key, value: args.statB.value, period: args.statB.period },
        eventStatRoot: args.statB.eventStatRoot,
        statProof: args.statB.statProof,
      },
      { add: {} },
    )
      .accounts({ dailyScoresMerkleRoots: dailyRootsPda })
      .view()) as boolean;
  };
}

export function createOracleVerifier(deps: OracleVerifierDeps): OracleVerifier {
  const nowMs = deps.nowMs ?? Date.now;
  const fetchSnapshot = deps.fetchSnapshot ?? fetchScoresSnapshot;
  const fetchValidation = deps.fetchValidation ?? fetchScoresStatValidation;
  const runView = deps.runView ?? buildAnchorView(deps);

  interface CacheEntry {
    verification: OracleVerification;
    expiresAtMs: number | null;
  }
  const cache = new Map<string, CacheEntry>();

  const currentAuth = (): { jwt: string; apiToken: string } => ({
    jwt: deps.sharedAuth.current.jwt,
    apiToken: deps.sharedAuth.current.apiToken,
  });

  type FinalRecordResult =
    | { ok: true; value: ScoresUpdate | null }
    | { ok: false; reason: string };

  /** Newest snapshot record carrying both a Score and a Seq. */
  const findFinalRecord = async (fixtureId: number): Promise<FinalRecordResult> => {
    let snapshot = await fetchSnapshot(deps.cfg, currentAuth(), fixtureId);
    if (!snapshot.ok && snapshot.error.code === 'auth_expired') {
      const refreshed = await refreshGuestJwt(deps.cfg, deps.sharedAuth);
      if (refreshed) {
        snapshot = await fetchSnapshot(deps.cfg, currentAuth(), fixtureId);
      }
    }
    if (!snapshot.ok) {
      return { ok: false, reason: `snapshot_failed: ${snapshot.error.code}` };
    }
    let finalRecord: ScoresUpdate | null = null;
    for (const record of snapshot.value) {
      if (record.Score === undefined || record.Seq === undefined) {
        continue;
      }
      if (finalRecord === null || record.Ts > finalRecord.Ts) {
        finalRecord = record;
      }
    }
    return { ok: true, value: finalRecord };
  };

  const provePair = async (
    fixtureId: number,
    seq: number,
    pair: StatPairSpec,
  ): Promise<
    | { ok: true; proven: OracleProvenFinal; epochDay: number; eventTs: number }
    | { ok: false; status: 'pending' | 'unavailable' | 'mismatch'; reason: string }
  > => {
    const validation = await fetchValidation(deps.cfg, currentAuth(), {
      fixtureId,
      seq,
      statKey: pair.p1BaseKey,
      statKey2: pair.p2BaseKey,
    });
    if (!validation.ok) {
      return { ok: false, status: 'unavailable', reason: `proof_fetch_failed: ${validation.error.code}` };
    }
    const payload = validation.value;
    if (payload.statToProve2 === undefined) {
      return { ok: false, status: 'unavailable', reason: 'proof_incomplete: second stat missing' };
    }
    const eventsSubTreeRoot = decodeOracleBinary32(payload.summary.eventStatsSubTreeRoot);
    const eventStatRoot = decodeOracleBinary32(payload.eventStatRoot);
    const statProof = decodeOracleProof(payload.statProof);
    const statProof2 = decodeOracleProof(payload.statProof2 ?? null);
    const fixtureProof = decodeOracleProof(payload.subTreeProof);
    const mainTreeProof = decodeOracleProof(payload.mainTreeProof);
    if (
      eventsSubTreeRoot === null ||
      eventStatRoot === null ||
      statProof === null ||
      statProof2 === null ||
      fixtureProof === null ||
      mainTreeProof === null
    ) {
      return { ok: false, status: 'unavailable', reason: 'proof_undecodable' };
    }

    const totalValue = payload.statToProve.value + payload.statToProve2.value;
    let verdict: boolean;
    try {
      verdict = await runView({
        ts: payload.ts,
        summary: {
          fixtureId: payload.summary.fixtureId,
          updateCount: payload.summary.updateStats.updateCount,
          minTimestamp: payload.summary.updateStats.minTimestamp,
          maxTimestamp: payload.summary.updateStats.maxTimestamp,
          eventsSubTreeRoot,
        },
        fixtureProof,
        mainTreeProof,
        threshold: totalValue,
        statA: {
          key: payload.statToProve.key,
          value: payload.statToProve.value,
          period: payload.statToProve.period,
          eventStatRoot,
          statProof,
        },
        statB: {
          key: payload.statToProve2.key,
          value: payload.statToProve2.value,
          period: payload.statToProve2.period,
          eventStatRoot,
          statProof: statProof2,
        },
      });
    } catch (cause) {
      const messageText = cause instanceof Error ? cause.message : String(cause);
      if (isMissingRootAccountError(messageText)) {
        return { ok: false, status: 'pending', reason: 'daily_root_not_posted' };
      }
      return { ok: false, status: 'unavailable', reason: `view_failed: ${messageText.slice(0, 120)}` };
    }
    if (!verdict) {
      return { ok: false, status: 'mismatch', reason: `on_chain_false: ${pair.label}` };
    }
    return {
      ok: true,
      proven: { label: pair.label, p1: payload.statToProve.value, p2: payload.statToProve2.value },
      epochDay: Math.floor(payload.ts / ORACLE_MS_PER_DAY),
      eventTs: payload.ts,
    };
  };

  return {
    verifyCategory: async (fixtureId, category) => {
      const pairs = PAIRS_BY_CATEGORY[category];
      if (pairs === undefined) {
        // Probability picks settle on odds, not scores; out of scope for v1.
        return {
          status: 'unavailable',
          reason: 'market_priced_pick',
          checkedAtMs: nowMs(),
        };
      }

      const cacheKey = `${fixtureId}:${category}`;
      const cached = cache.get(cacheKey);
      if (cached !== undefined && (cached.expiresAtMs === null || cached.expiresAtMs > nowMs())) {
        return cached.verification;
      }

      const store = (verification: OracleVerification): OracleVerification => {
        const isFinalVerdict =
          verification.status === 'verified' || verification.status === 'mismatch';
        cache.set(cacheKey, {
          verification,
          expiresAtMs: isFinalVerdict ? null : nowMs() + TRANSIENT_CACHE_TTL_MS,
        });
        return verification;
      };

      const finalRecord = await findFinalRecord(fixtureId);
      if (!finalRecord.ok) {
        return store({ status: 'unavailable', reason: finalRecord.reason, checkedAtMs: nowMs() });
      }
      if (finalRecord.value === null || finalRecord.value.Seq === undefined) {
        return store({ status: 'unavailable', reason: 'no_scored_record', checkedAtMs: nowMs() });
      }
      const seq = finalRecord.value.Seq;

      const provenFinals: OracleProvenFinal[] = [];
      let epochDay: number | undefined;
      let eventTs: number | undefined;
      for (const pair of pairs) {
        const proven = await provePair(fixtureId, seq, pair);
        if (!proven.ok) {
          if (proven.status === 'mismatch') {
            console.error(
              `[verifyCategory] fixture ${fixtureId} ${category}: ON-CHAIN MISMATCH (${proven.reason})`,
            );
          }
          return store({ status: proven.status, reason: proven.reason, checkedAtMs: nowMs() });
        }
        provenFinals.push(proven.proven);
        epochDay = proven.epochDay;
        eventTs = proven.eventTs;
      }
      console.log(
        `[verifyCategory] fixture ${fixtureId} ${category}: verified on-chain (${provenFinals
          .map((final) => `${final.label} ${final.p1}-${final.p2}`)
          .join(', ')})`,
      );
      return store({
        status: 'verified',
        checkedAtMs: nowMs(),
        epochDay,
        provenFinals,
        eventSeq: seq,
        eventTs,
      });
    },
  };
}
