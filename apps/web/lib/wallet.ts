import type { GuestSession, WalletChallengePayload } from '@calledit/contracts';
import { workerUrl } from './api';

/**
 * Optional Solana wallet link, client side. The player signs a fresh
 * server-issued challenge with their wallet (Phantom) to claim their profile or
 * restore it on a new device. No transaction is ever signed; this only proves
 * wallet ownership. The wallet is never required to play.
 */

// Minimal shape of the injected Phantom provider (window.solana). Typed so no
// `any` leaks in; only the two calls this feature needs are declared.
interface PhantomProvider {
  isPhantom?: boolean;
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>;
  signMessage(message: Uint8Array, display?: string): Promise<{ signature: Uint8Array }>;
}

export type WalletFailure =
  | 'no_wallet'
  | 'rejected'
  | 'wallet_taken'
  | 'wallet_unlinked'
  | 'challenge_expired'
  | 'signature_mismatch'
  | 'invalid_wallet'
  | 'network'
  | 'server';

function getProvider(): PhantomProvider | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const provider = (window as Window & { solana?: PhantomProvider }).solana;
  return provider !== undefined && provider.isPhantom === true ? provider : null;
}

/** Base64 without Buffer (browser): the signature is 64 bytes. */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return window.btoa(binary);
}

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
 * Connect the wallet and sign a fresh challenge. Returns the base58 pubkey plus
 * the signed nonce, or a distinct failure (no wallet, user rejected, feed down).
 */
async function proveOwnership(): Promise<
  { ok: true; walletPubkey: string; nonce: string; signature: string } | { ok: false; reason: WalletFailure }
> {
  const provider = getProvider();
  if (provider === null) {
    return { ok: false, reason: 'no_wallet' };
  }
  let walletPubkey: string;
  try {
    const connected = await provider.connect();
    walletPubkey = connected.publicKey.toString();
  } catch {
    return { ok: false, reason: 'rejected' };
  }
  const challenge = await fetchChallenge();
  if (challenge === null) {
    return { ok: false, reason: 'network' };
  }
  try {
    const signed = await provider.signMessage(
      new TextEncoder().encode(challenge.message),
      'utf8',
    );
    return {
      ok: true,
      walletPubkey,
      nonce: challenge.nonce,
      signature: toBase64(signed.signature),
    };
  } catch {
    return { ok: false, reason: 'rejected' };
  }
}

export type WalletLinkOutcome =
  | { ok: true; walletPubkey: string }
  | { ok: false; reason: WalletFailure };

/** Link the connected wallet to the authenticated guest (claim the profile). */
export async function linkWalletToProfile(session: GuestSession): Promise<WalletLinkOutcome> {
  const proof = await proveOwnership();
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

/** Restore the guest that owns the connected wallet, returning a fresh session. */
export async function restoreProfileFromWallet(): Promise<WalletRestoreOutcome> {
  const proof = await proveOwnership();
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
  no_wallet: 'No Solana wallet found. Install Phantom, then try again.',
  rejected: 'Wallet request cancelled.',
  wallet_taken: 'That wallet already claims another profile.',
  wallet_unlinked: 'No profile is linked to that wallet yet.',
  challenge_expired: 'The request timed out. Try again.',
  signature_mismatch: 'The signature did not verify. Try again.',
  invalid_wallet: 'That wallet address is not valid.',
  network: 'Could not reach the game server. Check your connection and retry.',
  server: 'The game server had a hiccup. Retry in a moment.',
};
