import type { OracleBinary, OracleProofNode } from './types.js';

/**
 * Decoders for the stat-validation binary material. The live API serves raw
 * JSON byte arrays (the spec says string); base64 and hex strings are
 * accepted as fallbacks so a future server change does not break clients.
 * Verified on mainnet 2026-07-09 (spike/src/08-stat-validation.ts).
 */

export function decodeOracleBinary32(raw: OracleBinary): number[] | null {
  if (Array.isArray(raw)) {
    return raw.length === 32 &&
      raw.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
      ? raw
      : null;
  }
  const fromBase64 = Buffer.from(raw, 'base64');
  if (fromBase64.length === 32) {
    return Array.from(fromBase64);
  }
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Array.from(Buffer.from(raw, 'hex'));
  }
  return null;
}

export interface DecodedProofNode {
  hash: number[];
  isRightSibling: boolean;
}

/** Decode a proof path; returns null when any node hash is undecodable. */
export function decodeOracleProof(nodes: OracleProofNode[] | null): DecodedProofNode[] | null {
  const decoded: DecodedProofNode[] = [];
  for (const node of nodes ?? []) {
    const hash = decodeOracleBinary32(node.hash);
    if (hash === null) {
      return null;
    }
    decoded.push({ hash, isRightSibling: node.isRightSibling });
  }
  return decoded;
}

/** Base stat keys; full key = period * 1000 + base (period 0 = full match). */
export const ORACLE_STAT_BASE_KEYS = {
  goalsP1: 1,
  goalsP2: 2,
  yellowCardsP1: 3,
  yellowCardsP2: 4,
  redCardsP1: 5,
  redCardsP2: 6,
  cornersP1: 7,
  cornersP2: 8,
} as const;

/** Milliseconds per epoch day; the daily roots PDA is keyed by this. */
export const ORACLE_MS_PER_DAY = 86_400_000;
