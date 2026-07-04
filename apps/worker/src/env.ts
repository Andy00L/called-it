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

  const rawPort = emptyToUndefined(process.env['WORKER_PORT']);
  const port = rawPort !== undefined ? Number.parseInt(rawPort, 10) : DEFAULT_WORKER_PORT;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return err(`WORKER_PORT must be a TCP port between 1 and 65535, got: ${rawPort ?? ''}`);
  }

  const tapesDirectory =
    emptyToUndefined(process.env['TAPES_DIR']) ?? resolve(import.meta.dirname, '../tapes');

  return ok({ cfg, jwt, apiToken, port, tapesDirectory });
}
