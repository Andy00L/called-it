import type { GuestSession, WalletChallengePayload } from '@calledit/contracts';
import { workerUrl } from './api';
import { connectAndSignMessage } from './solana-wallets';

/**
 * Optional Solana wallet link, client side. The player picks a discovered
 * wallet (Wallet Standard, with legacy Phantom as fallback) and signs a fresh
 * server-issued challenge with it to claim their profile or restore it on a
 * new device. No transaction is ever signed; this only proves wallet
 * ownership. The wallet is never required to play.
 */

export type WalletFailure =
  | 'no_wallet'
  | 'rejected'
  | 'unsupported'
  | 'wallet_taken'
  | 'wallet_unlinked'
  | 'challenge_expired'
  | 'signature_mismatch'
  | 'invalid_wallet'
  | 'network'
  | 'server';

const KNOWN_WALLET_ERRORS: readonly WalletFailure[] = [
  'wallet_taken',
  'wallet_unlinked',
  'challenge_expired',
  'signature_mismatch',
  'invalid_wallet',
];

function mapErrorCode(code: string): WalletFailure {
  return (KNOWN_WALLET_ERRORS as readonly string[]).includes(code)
    ? (code as WalletFailure)
    : 'server';
}

async function fetchChallenge(): Promise<WalletChallengePayload | null> {
  try {
    const response = await fetch(`${workerUrl()}/players/challenge`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as WalletChallengePayload;
  } catch {
    return null;
  }
}

/**
 * Sign a fresh challenge with the chosen wallet. Returns the base58 pubkey
 * plus the signed nonce, or a distinct failure (no wallet, user rejected,
 * wallet cannot sign plain bytes, feed down).
 */
async function proveOwnership(
  walletId: string,
): Promise<
  | { ok: true; walletPubkey: string; nonce: string; signature: string }
  | { ok: false; reason: WalletFailure }
> {
  const challenge = await fetchChallenge();
  if (challenge === null) {
    return { ok: false, reason: 'network' };
  }
  const signed = await connectAndSignMessage(walletId, challenge.message);
  if (!signed.ok) {
    return signed;
  }
  return {
    ok: true,
    walletPubkey: signed.walletPubkey,
    nonce: challenge.nonce,
    signature: signed.signatureBase64,
  };
}

export type WalletLinkOutcome =
  | { ok: true; walletPubkey: string }
  | { ok: false; reason: WalletFailure };

/** Link the chosen wallet to the authenticated guest (claim the profile). */
export async function linkWalletToProfile(
  session: GuestSession,
  walletId: string,
): Promise<WalletLinkOutcome> {
  const proof = await proveOwnership(walletId);
  if (!proof.ok) {
    return proof;
  }
  let response: Response;
  try {
    response = await fetch(`${workerUrl()}/players/wallet-link`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-player-id': session.playerId,
        'x-player-token': session.playerToken,
      },
      body: JSON.stringify({
        walletPubkey: proof.walletPubkey,
        nonce: proof.nonce,
        signature: proof.signature,
      }),
    });
  } catch {
    return { ok: false, reason: 'network' };
  }
  if (response.ok) {
    return { ok: true, walletPubkey: proof.walletPubkey };
  }
  try {
    const body = (await response.json()) as { error?: string };
    return { ok: false, reason: mapErrorCode(body.error ?? '') };
  } catch {
    return { ok: false, reason: 'server' };
  }
}

export type WalletRestoreOutcome =
  | { ok: true; session: GuestSession }
  | { ok: false; reason: WalletFailure };

/** Restore the guest that owns the chosen wallet, returning a fresh session. */
export async function restoreProfileFromWallet(walletId: string): Promise<WalletRestoreOutcome> {
  const proof = await proveOwnership(walletId);
  if (!proof.ok) {
    return proof;
  }
  let response: Response;
  try {
    response = await fetch(`${workerUrl()}/players/wallet-restore`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        walletPubkey: proof.walletPubkey,
        nonce: proof.nonce,
        signature: proof.signature,
      }),
    });
  } catch {
    return { ok: false, reason: 'network' };
  }
  if (response.ok) {
    try {
      return { ok: true, session: (await response.json()) as GuestSession };
    } catch {
      return { ok: false, reason: 'server' };
    }
  }
  try {
    const body = (await response.json()) as { error?: string };
    return { ok: false, reason: mapErrorCode(body.error ?? '') };
  } catch {
    return { ok: false, reason: 'server' };
  }
}

/** Short base58 for display: first 4 + last 4. */
export function shortWallet(walletPubkey: string): string {
  return walletPubkey.length <= 10
    ? walletPubkey
    : `${walletPubkey.slice(0, 4)}...${walletPubkey.slice(-4)}`;
}

/** Player-facing copy per wallet failure (distinct, actionable). */
export const WALLET_FAILURE_COPY: Record<WalletFailure, string> = {
  no_wallet: 'No Solana wallet found in this browser. Install Phantom, then reload.',
  rejected: 'Request cancelled in the wallet.',
  unsupported: 'That wallet cannot sign plain messages. Try Phantom or Solflare.',
  wallet_taken: 'That wallet already claims another profile.',
  wallet_unlinked: 'No profile is linked to that wallet yet.',
  challenge_expired: 'The request timed out. Try again.',
  signature_mismatch: 'The signature did not verify. Try again.',
  invalid_wallet: 'That wallet address is not valid.',
  network: 'Could not reach the game server. Check your connection and retry.',
  server: 'The game server had a hiccup. Retry in a moment.',
};
