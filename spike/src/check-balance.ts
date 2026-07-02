import { Connection, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { getNetworkConfig } from '@calledit/txline';
import { loadKeypair, readEnv } from './env.js';

const env = readEnv();
const pubkey = loadKeypair(env.walletKeypairPath).publicKey;
console.log(`Wallet: ${pubkey.toBase58()}\n`);

for (const network of ['devnet', 'mainnet'] as const) {
  const cfg = getNetworkConfig(network);
  const connection = new Connection(cfg.defaultRpcUrl, 'confirmed');
  try {
    const lamports = await connection.getBalance(new PublicKey(pubkey));
    console.log(`${network}: ${(lamports / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
  } catch (cause) {
    console.log(`${network}: check failed (${cause instanceof Error ? cause.message : String(cause)})`);
  }
}
