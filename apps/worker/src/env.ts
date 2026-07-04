import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import {
  err,
  getNetworkConfig,
  ok,
  type Result,
  type TxlineNetworkConfig,
} from '@calledit/txline';

// The shared .env lives at the repo root, three levels above apps/worker/src
// (same file the spike scripts write JWT and API token into).
loadDotenv({ path: resolve(import.meta.dirname, '../../../.env') });

// TCP port the fan-out server binds by default; override with WORKER_PORT.
const DEFAULT_WORKER_PORT = 8787;

export interface WorkerEnv {
  cfg: TxlineNetworkConfig;
  jwt: string;
  apiToken: string;
  port: number;
  /** Directory receiving one NDJSON tape per fixture. */
  tapesDirectory: string;
  /** Both present = durable persistence; both absent = memory fallback. */
  supabaseUrl: string | undefined;
  supabaseSecretKey: string | undefined;
  /** RPC endpoint for on-chain commitment posting. */
  rpcUrl: string;
  /** Wallet secret key bytes; undefined = commitments disabled. */
  walletSecret: Uint8Array | undefined;
}

/**
 * Wallet resolution: WALLET_SECRET_KEY (JSON array string, for Railway) wins
 * over WALLET_KEYPAIR_PATH (local file). Neither = commitments stay off.
 */
function readWalletSecret(): Result<Uint8Array | undefined, string> {
  const inlineSecret = emptyToUndefined(process.env['WALLET_SECRET_KEY']);
  const keypairPath = emptyToUndefined(process.env['WALLET_KEYPAIR_PATH']);
  let rawJson: string | undefined;
  if (inlineSecret !== undefined) {
    rawJson = inlineSecret;
  } else if (keypairPath !== undefined) {
    const resolvedPath = resolve(import.meta.dirname, '../../..', keypairPath);
    if (!existsSync(resolvedPath)) {
      // A configured path that does not exist is a warning, not a crash: the
      // Railway image ships without wallet.json on purpose.
      console.warn(`[readWalletSecret] keypair file absent (${resolvedPath}), commitments off`);
      return ok(undefined);
    }
    rawJson = readFileSync(resolvedPath, 'utf8');
  } else {
    return ok(undefined);
  }
  try {
    const parsed = JSON.parse(rawJson) as number[];
    if (!Array.isArray(parsed) || parsed.length !== 64) {
      return err('wallet secret must be a JSON array of 64 bytes');
    }
    return ok(Uint8Array.from(parsed));
  } catch {
    return err('wallet secret is not valid JSON');
  }
}

function emptyToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}

/**
 * Read and validate the worker environment. The spike keeps its own reader
 * because it needs wallet and subscription settings; the worker must not
 * depend on a scratch package, so the two tiny helpers are local here.
 */
export function readWorkerEnv(): Result<WorkerEnv, string> {
  const rawNetwork = process.env['TXLINE_NETWORK'] ?? 'devnet';
  if (rawNetwork !== 'mainnet' && rawNetwork !== 'devnet') {
    return err(`TXLINE_NETWORK must be mainnet or devnet, got: ${rawNetwork}`);
  }
  const cfg = getNetworkConfig(rawNetwork);

  const jwt = emptyToUndefined(process.env['TXLINE_JWT']);
  if (jwt === undefined) {
    return err('Missing TXLINE_JWT. Run: pnpm --filter @calledit/spike auth');
  }
  const apiToken = emptyToUndefined(process.env['TXLINE_API_TOKEN']);
  if (apiToken === undefined) {
    return err('Missing TXLINE_API_TOKEN. Run: pnpm --filter @calledit/spike activate');
  }

  // WORKER_PORT wins locally; PORT is what Railway and most hosts inject.
  const rawPort =
    emptyToUndefined(process.env['WORKER_PORT']) ?? emptyToUndefined(process.env['PORT']);
  const port = rawPort !== undefined ? Number.parseInt(rawPort, 10) : DEFAULT_WORKER_PORT;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return err(`WORKER_PORT/PORT must be a TCP port between 1 and 65535, got: ${rawPort ?? ''}`);
  }

  const tapesDirectory =
    emptyToUndefined(process.env['TAPES_DIR']) ?? resolve(import.meta.dirname, '../tapes');

  const supabaseUrl = emptyToUndefined(process.env['SUPABASE_URL']);
  const supabaseSecretKey = emptyToUndefined(process.env['SUPABASE_SECRET_KEY']);
  // Half-configured persistence is a silent-data-loss footgun: refuse it.
  if ((supabaseUrl === undefined) !== (supabaseSecretKey === undefined)) {
    return err(
      'SUPABASE_URL and SUPABASE_SECRET_KEY must be set together (or both left empty for memory mode)',
    );
  }

  // Network-specific RPC wins, then the generic override, then the public RPC.
  const rpcUrl =
    emptyToUndefined(
      process.env[rawNetwork === 'mainnet' ? 'SOLANA_RPC_URL_MAINNET' : 'SOLANA_RPC_URL_DEVNET'],
    ) ??
    emptyToUndefined(process.env['SOLANA_RPC_URL']) ??
    cfg.defaultRpcUrl;

  const walletSecret = readWalletSecret();
  if (!walletSecret.ok) {
    return walletSecret;
  }

  return ok({
    cfg,
    jwt,
    apiToken,
    port,
    tapesDirectory,
    supabaseUrl,
    supabaseSecretKey,
    rpcUrl,
    walletSecret: walletSecret.value,
  });
}
