import { useSyncExternalStore } from 'react';

/**
 * Minimal Solana wallet discovery over the Wallet Standard, plus the legacy
 * Phantom injection as a fallback. This is the Solana analog of EIP-6963
 * discovery: wallets announce themselves through window events and the app
 * shows a picker of what it found, instead of hard-wiring one provider.
 *
 * Protocol (sourceRef: wallet-standard/packages/core/app/src/wallets.ts):
 * - the app listens for 'wallet-standard:register-wallet' and calls the event
 *   detail callback with { register };
 * - the app dispatches 'wallet-standard:app-ready' carrying { register } so
 *   wallets injected before the app can register too.
 * Features used (sourceRef: wallet-standard connect.ts, anza signMessage.ts):
 * - 'standard:connect': connect() resolves { accounts: WalletAccount[] };
 * - 'solana:signMessage': signMessage({ account, message }) resolves
 *   [{ signedMessage, signature }], Ed25519.
 */

export interface SolanaWalletEntry {
  id: string;
  name: string;
  /** Data-URI icon from the wallet's own registration; null for the fallback. */
  icon: string | null;
}

export type WalletSignFailure = 'no_wallet' | 'rejected' | 'unsupported';

export type WalletSignOutcome =
  | { ok: true; walletPubkey: string; signatureBase64: string }
  | { ok: false; reason: WalletSignFailure };

interface StandardWalletAccount {
  address: string;
  chains: readonly string[];
}

interface StandardConnectFeature {
  connect(input?: { silent?: boolean }): Promise<{ accounts: readonly StandardWalletAccount[] }>;
}

interface SolanaSignMessageFeature {
  signMessage(
    ...inputs: { account: StandardWalletAccount; message: Uint8Array }[]
  ): Promise<readonly { signedMessage: Uint8Array; signature: Uint8Array }[]>;
}

interface StandardWallet {
  name: string;
  icon: string;
  chains: readonly string[];
  features: Record<string, unknown>;
}

/** Legacy injected Phantom (window.solana), kept as the discovery fallback. */
interface LegacyPhantomProvider {
  isPhantom?: boolean;
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }>;
  signMessage(message: Uint8Array, display?: string): Promise<{ signature: Uint8Array }>;
}

const LEGACY_PHANTOM_ID = 'legacy:phantom';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isStandardWallet(value: unknown): value is StandardWallet {
  return (
    isRecord(value) &&
    typeof value['name'] === 'string' &&
    typeof value['icon'] === 'string' &&
    Array.isArray(value['chains']) &&
    isRecord(value['features'])
  );
}

function isSolanaCapable(wallet: StandardWallet): boolean {
  const speaksSolana = wallet.chains.some((chain) => chain.startsWith('solana:'));
  const connectFeature = wallet.features['standard:connect'];
  const signFeature = wallet.features['solana:signMessage'];
  return (
    speaksSolana &&
    isRecord(connectFeature) &&
    typeof connectFeature['connect'] === 'function' &&
    isRecord(signFeature) &&
    typeof signFeature['signMessage'] === 'function'
  );
}

function getLegacyPhantom(): LegacyPhantomProvider | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const provider = (window as Window & { solana?: LegacyPhantomProvider }).solana;
  return provider !== undefined && provider.isPhantom === true ? provider : null;
}

/** Base64 without Buffer (browser): signatures are 64 bytes. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return window.btoa(binary);
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((byte, index) => byte === right[index]);
}

// Module registry: discovery runs once per page, entries update as wallets
// announce themselves (some inject after load). Snapshot identity is stable
// between changes so useSyncExternalStore does not loop.
const standardWalletsByName = new Map<string, StandardWallet>();
const changeListeners = new Set<() => void>();
let snapshot: SolanaWalletEntry[] = [];
const EMPTY_SNAPSHOT: SolanaWalletEntry[] = [];
let discoveryStarted = false;

function rebuildSnapshot(): void {
  const entries: SolanaWalletEntry[] = [...standardWalletsByName.values()].map((wallet) => ({
    id: `standard:${wallet.name}`,
    name: wallet.name,
    icon: wallet.icon,
  }));
  // The legacy injection only fills the gap when Phantom did not register
  // through the standard (older extension versions).
  const hasStandardPhantom = [...standardWalletsByName.keys()].some(
    (name) => name.toLowerCase() === 'phantom',
  );
  if (!hasStandardPhantom && getLegacyPhantom() !== null) {
    entries.push({ id: LEGACY_PHANTOM_ID, name: 'Phantom', icon: null });
  }
  entries.sort((left, right) => left.name.localeCompare(right.name));
  snapshot = entries;
  for (const notifyChange of changeListeners) {
    notifyChange();
  }
}

function registerWallets(...candidates: unknown[]): () => void {
  let addedCount = 0;
  for (const candidate of candidates) {
    if (isStandardWallet(candidate) && isSolanaCapable(candidate)) {
      standardWalletsByName.set(candidate.name, candidate);
      addedCount += 1;
    }
  }
  if (addedCount > 0) {
    rebuildSnapshot();
  }
  return () => undefined;
}

function startDiscovery(): void {
  if (discoveryStarted || typeof window === 'undefined') {
    return;
  }
  discoveryStarted = true;
  const api = { register: registerWallets };
  window.addEventListener('wallet-standard:register-wallet', (event) => {
    const callback = (event as CustomEvent<(walletApi: typeof api) => void>).detail;
    if (typeof callback === 'function') {
      callback(api);
    }
  });
  window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: api }));
  // Legacy Phantom may exist even when nothing registered via the standard.
  rebuildSnapshot();
}

export function subscribeToSolanaWallets(onChange: () => void): () => void {
  startDiscovery();
  changeListeners.add(onChange);
  return () => {
    changeListeners.delete(onChange);
  };
}

export function getSolanaWalletsSnapshot(): SolanaWalletEntry[] {
  return snapshot;
}

/** Reactive list of discovered wallets; empty array on the server. */
export function useSolanaWallets(): SolanaWalletEntry[] {
  return useSyncExternalStore(
    subscribeToSolanaWallets,
    getSolanaWalletsSnapshot,
    () => EMPTY_SNAPSHOT,
  );
}

async function signWithStandardWallet(
  wallet: StandardWallet,
  message: string,
): Promise<WalletSignOutcome> {
  const connectFeature = wallet.features['standard:connect'] as StandardConnectFeature;
  const signFeature = wallet.features['solana:signMessage'] as SolanaSignMessageFeature;
  let accounts: readonly StandardWalletAccount[];
  try {
    accounts = (await connectFeature.connect()).accounts;
  } catch {
    return { ok: false, reason: 'rejected' };
  }
  const account =
    accounts.find((candidate) => candidate.chains.some((chain) => chain.startsWith('solana:'))) ??
    accounts[0];
  if (account === undefined || typeof account.address !== 'string') {
    return { ok: false, reason: 'rejected' };
  }
  const messageBytes = new TextEncoder().encode(message);
  let signed: { signedMessage: Uint8Array; signature: Uint8Array } | undefined;
  try {
    [signed] = await signFeature.signMessage({ account, message: messageBytes });
  } catch {
    return { ok: false, reason: 'rejected' };
  }
  if (signed === undefined) {
    return { ok: false, reason: 'unsupported' };
  }
  // The standard allows a wallet to prefix the message before signing; the
  // server verifies the exact challenge bytes, so a modified message can
  // never verify. Fail fast with a distinct reason instead of a mismatch.
  if (!bytesEqual(signed.signedMessage, messageBytes)) {
    return { ok: false, reason: 'unsupported' };
  }
  return {
    ok: true,
    walletPubkey: account.address,
    signatureBase64: bytesToBase64(signed.signature),
  };
}

async function signWithLegacyPhantom(message: string): Promise<WalletSignOutcome> {
  const provider = getLegacyPhantom();
  if (provider === null) {
    return { ok: false, reason: 'no_wallet' };
  }
  let walletPubkey: string;
  try {
    walletPubkey = (await provider.connect()).publicKey.toString();
  } catch {
    return { ok: false, reason: 'rejected' };
  }
  try {
    const signed = await provider.signMessage(new TextEncoder().encode(message), 'utf8');
    return { ok: true, walletPubkey, signatureBase64: bytesToBase64(signed.signature) };
  } catch {
    return { ok: false, reason: 'rejected' };
  }
}

/**
 * Connect the chosen wallet and sign the challenge message with it. The
 * pubkey is the account's base58 address; the signature is base64 for the
 * worker's verify endpoint.
 */
export async function connectAndSignMessage(
  walletId: string,
  message: string,
): Promise<WalletSignOutcome> {
  if (walletId === LEGACY_PHANTOM_ID) {
    return signWithLegacyPhantom(message);
  }
  const walletName = walletId.replace(/^standard:/, '');
  const wallet = standardWalletsByName.get(walletName);
  if (wallet === undefined) {
    return { ok: false, reason: 'no_wallet' };
  }
  return signWithStandardWallet(wallet, message);
}
