export type TxlineNetwork = 'mainnet' | 'devnet';

export interface TxlineNetworkConfig {
  network: TxlineNetwork;
  /** Origin for auth endpoints, e.g. POST {apiOrigin}/auth/guest/start */
  apiOrigin: string;
  /** Base for data endpoints, e.g. GET {apiBaseUrl}/scores/stream */
  apiBaseUrl: string;
  /** Txoracle program id */
  programId: string;
  txlMint: string;
  usdtMint: string;
  defaultRpcUrl: string;
}

export const PDA_SEEDS = {
  tokenTreasury: 'token_treasury_v2',
  usdtTreasury: 'usdt_treasury',
  pricingMatrix: 'pricing_matrix',
  dailyScoresRoots: 'daily_scores_roots',
  dailyBatchRoots: 'daily_batch_roots',
  tenDailyFixturesRoots: 'ten_daily_fixtures_roots',
} as const;

/** Free World Cup tiers (docs: World Cup Free Tier). */
export const SERVICE_LEVELS = {
  /** World Cup + Int Friendlies, 60 second delay. Available on devnet and mainnet. */
  worldCupDelayed: 1,
  /** World Cup + Int Friendlies, real-time. Mainnet only. */
  worldCupRealtime: 12,
} as const;

const CONFIGS: Record<TxlineNetwork, TxlineNetworkConfig> = {
  mainnet: {
    network: 'mainnet',
    apiOrigin: 'https://txline.txodds.com',
    apiBaseUrl: 'https://txline.txodds.com/api',
    programId: '9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA',
    txlMint: 'Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL',
    usdtMint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    defaultRpcUrl: 'https://api.mainnet-beta.solana.com',
  },
  devnet: {
    network: 'devnet',
    apiOrigin: 'https://txline-dev.txodds.com',
    apiBaseUrl: 'https://txline-dev.txodds.com/api',
    programId: '6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J',
    txlMint: '4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG',
    usdtMint: 'ELWTKspHKCnCfCiCiqYw1EDH77k8VCP74dK9qytG2Ujh',
    defaultRpcUrl: 'https://api.devnet.solana.com',
  },
};

export function getNetworkConfig(network: TxlineNetwork): TxlineNetworkConfig {
  return CONFIGS[network];
}
