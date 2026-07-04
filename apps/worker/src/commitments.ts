import { createHash, randomUUID } from 'node:crypto';
import type { MerkleProofStep, PickRecord } from '@calledit/contracts';
import type { CommitmentAssignment, PersistencePort } from './persistence.js';

/**
 * Pick commitments: every batch interval, all not-yet-committed picks are
 * hashed into a Merkle tree and the root is posted on Solana in a Memo
 * transaction. A receipt can then prove a pick existed, with its exact market
 * price, BEFORE its event resolved. Pure tree math lives here; the Solana
 * poster is injected so tests run without a wallet or network.
 */

// Batch cadence (build plan: "racine Merkle des picks publiée toutes les 60 s").
export const COMMITMENT_INTERVAL_MS = 60_000;

// Preimage format version; bump if the field list ever changes.
const LEAF_PREIMAGE_VERSION = 'calledit.pick.v1';

function sha256Hex(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Canonical leaf preimage: fixed field order, newline separated, versioned.
 * The receipt page documents this recipe so anyone can recompute the hash.
 */
export function buildLeafPreimage(pick: PickRecord): string {
  return [
    LEAF_PREIMAGE_VERSION,
    pick.id,
    pick.playerId ?? 'bookie',
    String(pick.fixtureId),
    pick.optionId,
    pick.probabilityFraction.toFixed(6),
    String(pick.potentialPoints),
    String(pick.lockedAtMs),
    String(pick.lockClockSeconds),
  ].join('\n');
}

export function hashPickLeaf(pick: PickRecord): string {
  return sha256Hex(buildLeafPreimage(pick));
}

function hashPairHex(leftHex: string, rightHex: string): string {
  return sha256Hex(Buffer.concat([Buffer.from(leftHex, 'hex'), Buffer.from(rightHex, 'hex')]));
}

export interface MerkleTree {
  rootHex: string;
  /** proofs[i] proves leaves[i] against rootHex. */
  proofs: MerkleProofStep[][];
}

/** Build a sha256 Merkle tree; an odd node is paired with itself. */
export function buildMerkleTree(leafHexes: readonly string[]): MerkleTree {
  if (leafHexes.length === 0) {
    return { rootHex: sha256Hex(''), proofs: [] };
  }
  const proofs: MerkleProofStep[][] = leafHexes.map(() => []);
  /** ownerLeaves[i] = indexes of the leaves under the current level's node i. */
  let ownerLeaves: number[][] = leafHexes.map((unusedLeaf, leafIndex) => [leafIndex]);
  let level: string[] = [...leafHexes];

  while (level.length > 1) {
    const nextLevel: string[] = [];
    const nextOwners: number[][] = [];
    for (let nodeIndex = 0; nodeIndex < level.length; nodeIndex += 2) {
      const leftHex = level[nodeIndex] ?? '';
      const rightHex = level[nodeIndex + 1] ?? leftHex;
      const leftOwners = ownerLeaves[nodeIndex] ?? [];
      const rightOwners = ownerLeaves[nodeIndex + 1] ?? [];
      for (const leafIndex of leftOwners) {
        proofs[leafIndex]?.push({ siblingHashHex: rightHex, isRightSibling: true });
      }
      for (const leafIndex of rightOwners) {
        proofs[leafIndex]?.push({ siblingHashHex: leftHex, isRightSibling: false });
      }
      nextLevel.push(hashPairHex(leftHex, rightHex));
      nextOwners.push([...leftOwners, ...rightOwners]);
    }
    level = nextLevel;
    ownerLeaves = nextOwners;
  }
  return { rootHex: level[0] ?? '', proofs };
}

/** Recompute the root from a leaf and its proof path. */
export function verifyMerkleProof(
  leafHex: string,
  proof: readonly MerkleProofStep[],
  rootHex: string,
): boolean {
  let currentHex = leafHex;
  for (const step of proof) {
    currentHex = step.isRightSibling
      ? hashPairHex(currentHex, step.siblingHashHex)
      : hashPairHex(step.siblingHashHex, currentHex);
  }
  return currentHex === rootHex;
}

/** Posts one root on Solana; injected so tests and dry runs skip the chain. */
export type MemoPoster = (rootHex: string) => Promise<
  { ok: true; txSig: string } | { ok: false; error: string }
>;

export interface CommitmentBatcherDeps {
  persistence: PersistencePort;
  /** Undefined = no wallet configured: nothing is committed (recoverable). */
  postMemo: MemoPoster | undefined;
  nowMs?: () => number;
}

export interface CommitmentBatcher {
  runOnce(): Promise<void>;
  start(): void;
  stop(): void;
}

export function createCommitmentBatcher(deps: CommitmentBatcherDeps): CommitmentBatcher {
  const nowMs = deps.nowMs ?? Date.now;
  let timer: NodeJS.Timeout | null = null;
  let running = false;

  const runOnce = async (): Promise<void> => {
    if (deps.postMemo === undefined || running) {
      return;
    }
    running = true;
    try {
      const listed = await deps.persistence.listUncommittedPicks();
      if (!listed.ok) {
        console.error(`[runCommitmentBatch] ${listed.error}`);
        return;
      }
      if (listed.value.length === 0) {
        return;
      }
      // Deterministic order: lock time, then id as the tie break.
      const picks = [...listed.value].sort(
        (left, right) => left.lockedAtMs - right.lockedAtMs || left.id.localeCompare(right.id),
      );
      const tree = buildMerkleTree(picks.map(hashPickLeaf));

      const posted = await deps.postMemo(tree.rootHex);
      if (!posted.ok) {
        // No tx, no record: the same picks retry on the next tick.
        console.error(`[runCommitmentBatch] memo post failed: ${posted.error}`);
        return;
      }

      const assignments: CommitmentAssignment[] = picks.map((pick, leafIndex) => ({
        pickId: pick.id,
        leafIndex,
        proof: tree.proofs[leafIndex] ?? [],
      }));
      const recorded = await deps.persistence.recordCommitment(
        {
          id: randomUUID(),
          rootHashHex: tree.rootHex,
          memoTxSig: posted.txSig,
          pickCount: picks.length,
          createdAtMs: nowMs(),
        },
        assignments,
      );
      if (!recorded.ok) {
        console.error(`[runCommitmentBatch] record failed after tx ${posted.txSig}: ${recorded.error}`);
        return;
      }
      console.log(
        `[runCommitmentBatch] committed ${picks.length} picks, root ${tree.rootHex.slice(0, 16)}..., tx ${posted.txSig}`,
      );
    } finally {
      running = false;
    }
  };

  return {
    runOnce,
    start: () => {
      if (timer !== null || deps.postMemo === undefined) {
        return;
      }
      timer = setInterval(() => {
        void runOnce();
      }, COMMITMENT_INTERVAL_MS);
    },
    stop: () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
