import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { Keypair } from '@solana/web3.js';
import {
  getNetworkConfig,
  type TxlineNetwork,
  type TxlineNetworkConfig,
} from '@calledit/txline';

loadDotenv({ path: resolve(import.meta.dirname, '../../.env') });

export interface SpikeEnv {
  cfg: TxlineNetworkConfig;
  rpcUrl: string;
  serviceLevelId: number;
  durationWeeks: number;
  jwt: string | undefined;
  txSig: string | undefined;
  apiToken: string | undefined;
  walletKeypairPath: string;
}

export function readEnv(): SpikeEnv {
  const rawNetwork = process.env['TXLINE_NETWORK'] ?? 'devnet';
  if (rawNetwork !== 'mainnet' && rawNetwork !== 'devnet') {
    console.error(`TXLINE_NETWORK must be mainnet or devnet, got: ${rawNetwork}`);
    process.exit(1);
  }
  const network: TxlineNetwork = rawNetwork;
  const cfg = getNetworkConfig(network);
  const rpcUrl =
    process.env['SOLANA_RPC_URL'] !== undefined && process.env['SOLANA_RPC_URL'] !== ''
      ? process.env['SOLANA_RPC_URL']
      : cfg.defaultRpcUrl;

  return {
    cfg,
    rpcUrl,
    serviceLevelId: Number.parseInt(process.env['TXLINE_SERVICE_LEVEL_ID'] ?? '1', 10),
    // subscribe rejects durations that are not a multiple of 4 weeks (Txoracle InvalidWeeks 6041, see docs/FEEDBACK.md)
    durationWeeks: Number.parseInt(process.env['TXLINE_DURATION_WEEKS'] ?? '4', 10),
    jwt: emptyToUndefined(process.env['TXLINE_JWT']),
    txSig: emptyToUndefined(process.env['TXLINE_TX_SIG']),
    apiToken: emptyToUndefined(process.env['TXLINE_API_TOKEN']),
    walletKeypairPath: resolve(
      import.meta.dirname,
      '../..',
      process.env['WALLET_KEYPAIR_PATH'] ?? 'wallet.json',
    ),
  };
}

function emptyToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}

export function loadKeypair(path: string): Keypair {
  const raw = readFileSync(path, 'utf8');
  const secret = Uint8Array.from(JSON.parse(raw) as number[]);
  return Keypair.fromSecretKey(secret);
}

export function requireValue<T>(value: T | undefined, name: string, hint: string): T {
  if (value === undefined) {
    console.error(`Missing ${name}. ${hint}`);
    process.exit(1);
  }
  return value;
}
