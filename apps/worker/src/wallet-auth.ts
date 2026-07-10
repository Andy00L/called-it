import { randomUUID } from 'node:crypto';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { err, ok, type Result } from '@calledit/txline';

/**
 * Optional wallet link: a player proves control of a Solana wallet by signing a
 * fresh, server-issued, single-use challenge (ed25519). The signed message is
 * bound to a nonce so a captured signature cannot be replayed. This is the only
 * trust boundary the wallet feature adds; it never signs a transaction or moves
 * value, it only verifies ownership to claim or restore a guest profile.
 */

// Challenge lifetime: long enough for a human to approve a wallet prompt,
// short enough that a leaked signature is quickly useless.
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

// Bound the outstanding-challenge map against a flood (each entry is tiny).
const MAX_OUTSTANDING_CHALLENGES = 10_000;

export interface WalletChallenge {
  nonce: string;
  /** The exact string the wallet must sign; the web client signs these bytes. */
  message: string;
}

export interface WalletVerifier {
  issueChallenge(): WalletChallenge;
  /**
   * Verify a signature over the challenge for `nonce`, then consume the nonce
   * (single use). Distinct reasons: challenge_expired, invalid_wallet,
   * invalid_signature, signature_mismatch.
   */
  verify(
    rawNonce: unknown,
    rawWalletPubkey: unknown,
    rawSignatureBase64: unknown,
  ): Result<{ walletPubkey: string }, string>;
}

/** The message a wallet signs for a given nonce (server and client must match). */
export function challengeMessage(nonce: string): string {
  return `CALLED IT\nProve wallet ownership to claim your profile\nnonce: ${nonce}`;
}

export function createWalletVerifier(options?: {
  nowMs?: () => number;
  ttlMs?: number;
}): WalletVerifier {
  const nowMs = options?.nowMs ?? Date.now;
  const ttlMs = options?.ttlMs ?? CHALLENGE_TTL_MS;
  /** nonce -> expiry epoch ms. */
  const outstanding = new Map<string, number>();

  const sweepExpired = (currentMs: number): void => {
    for (const [nonce, expiresAtMs] of outstanding) {
      if (expiresAtMs <= currentMs) {
        outstanding.delete(nonce);
      }
    }
  };

  return {
    issueChallenge: () => {
      const currentMs = nowMs();
      if (outstanding.size >= MAX_OUTSTANDING_CHALLENGES) {
        sweepExpired(currentMs);
      }
      const nonce = randomUUID();
      outstanding.set(nonce, currentMs + ttlMs);
      return { nonce, message: challengeMessage(nonce) };
    },

    verify: (rawNonce, rawWalletPubkey, rawSignatureBase64) => {
      if (typeof rawNonce !== 'string' || rawNonce === '') {
        return err('challenge_expired');
      }
      const expiresAtMs = outstanding.get(rawNonce);
      // Single use: consume the nonce whatever the outcome, so a signature can
      // never be replayed against the same challenge.
      outstanding.delete(rawNonce);
      if (expiresAtMs === undefined || expiresAtMs <= nowMs()) {
        return err('challenge_expired');
      }
      if (typeof rawWalletPubkey !== 'string' || rawWalletPubkey === '') {
        return err('invalid_wallet');
      }
      let publicKeyBytes: Uint8Array;
      try {
        publicKeyBytes = new PublicKey(rawWalletPubkey).toBytes();
      } catch {
        return err('invalid_wallet');
      }
      if (typeof rawSignatureBase64 !== 'string' || rawSignatureBase64 === '') {
        return err('invalid_signature');
      }
      const signatureBytes = new Uint8Array(Buffer.from(rawSignatureBase64, 'base64'));
      if (signatureBytes.length !== nacl.sign.signatureLength) {
        return err('invalid_signature');
      }
      const messageBytes = new TextEncoder().encode(challengeMessage(rawNonce));
      const valid = nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
      if (!valid) {
        return err('signature_mismatch');
      }
      return ok({ walletPubkey: rawWalletPubkey });
    },
  };
}
