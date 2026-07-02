import { existsSync, writeFileSync } from 'node:fs';
import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { loadKeypair, readEnv } from './env.js';

const env = readEnv();

let keypair: Keypair;
if (existsSync(env.walletKeypairPath)) {
  keypair = loadKeypair(env.walletKeypairPath);
  console.log(`Wallet already exists: ${keypair.publicKey.toBase58()}`);
} else {
  keypair = Keypair.generate();
  writeFileSync(env.walletKeypairPath, JSON.stringify(Array.from(keypair.secretKey)));
  console.log(`Wallet created at ${env.walletKeypairPath}`);
  console.log(`Pubkey: ${keypair.publicKey.toBase58()}`);
}

const connection = new Connection(env.rpcUrl, 'confirmed');
const balance = await connection.getBalance(keypair.publicKey);
console.log(`Balance on ${env.cfg.network}: ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL`);

if (env.cfg.network === 'devnet' && balance < 0.05 * LAMPORTS_PER_SOL) {
  for (const amount of [2, 1, 0.5]) {
    try {
      console.log(`Requesting devnet airdrop of ${amount} SOL...`);
      const signature = await connection.requestAirdrop(
        keypair.publicKey,
        Math.round(amount * LAMPORTS_PER_SOL),
      );
      const latest = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature, ...latest }, 'confirmed');
      const after = await connection.getBalance(keypair.publicKey);
      console.log(`Airdrop confirmed. Balance: ${(after / LAMPORTS_PER_SOL).toFixed(4)} SOL`);
      break;
    } catch (cause) {
      console.warn(`Airdrop of ${amount} SOL failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }
}

if (env.cfg.network === 'mainnet' && balance < 0.01 * LAMPORTS_PER_SOL) {
  console.log(`Fund this wallet with ~0.05 SOL to continue: ${keypair.publicKey.toBase58()}`);
}
