import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AnchorProvider, Program, Wallet, type Idl } from '@coral-xyz/anchor';
import {
  Connection,
  PublicKey,
  SystemProgram,
  type TransactionInstruction,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { PDA_SEEDS } from '@calledit/txline';
import { loadKeypair, readEnv } from './env.js';

interface SubscribeBuilder {
  accounts(accounts: Record<string, PublicKey>): SubscribeBuilder;
  preInstructions(instructions: TransactionInstruction[]): SubscribeBuilder;
  rpc(): Promise<string>;
}

const env = readEnv();
const keypair = loadKeypair(env.walletKeypairPath);
const connection = new Connection(env.rpcUrl, 'confirmed');
const provider = new AnchorProvider(connection, new Wallet(keypair), {
  commitment: 'confirmed',
});

console.log(`Network: ${env.cfg.network}`);
console.log(`Wallet:  ${keypair.publicKey.toBase58()}`);
console.log(`Program: ${env.cfg.programId}`);
console.log(`Tier:    service level ${env.serviceLevelId}, ${env.durationWeeks} weeks`);

const balance = await connection.getBalance(keypair.publicKey);
console.log(`Balance: ${(balance / 1e9).toFixed(4)} SOL`);
if (balance < 5_000_000) {
  const hint =
    env.cfg.network === 'devnet'
      ? `Fund it with: solana airdrop 2 ${keypair.publicKey.toBase58()} --url devnet`
      : 'Fund it with ~0.05 SOL before retrying.';
  console.error(`Wallet balance too low to pay transaction fees. ${hint}`);
  process.exit(1);
}

const programId = new PublicKey(env.cfg.programId);
const idl = await resolveIdl(programId);
const program = new Program(idl, provider);

const txlMint = new PublicKey(env.cfg.txlMint);
const [pricingMatrixPda] = PublicKey.findProgramAddressSync(
  [Buffer.from(PDA_SEEDS.pricingMatrix)],
  programId,
);
const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
  [Buffer.from(PDA_SEEDS.tokenTreasury)],
  programId,
);
const userTokenAccount = getAssociatedTokenAddressSync(
  txlMint,
  keypair.publicKey,
  false,
  TOKEN_2022_PROGRAM_ID,
);
const tokenTreasuryVault = getAssociatedTokenAddressSync(
  txlMint,
  tokenTreasuryPda,
  true,
  TOKEN_2022_PROGRAM_ID,
);

const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
  keypair.publicKey,
  userTokenAccount,
  keypair.publicKey,
  txlMint,
  TOKEN_2022_PROGRAM_ID,
);

const subscribeFactory = program.methods['subscribe'];
if (subscribeFactory === undefined) {
  console.error('IDL has no subscribe instruction; check the IDL source.');
  process.exit(1);
}

const builder = subscribeFactory(env.serviceLevelId, env.durationWeeks) as unknown as SubscribeBuilder;
const txSig = await builder
  .accounts({
    user: keypair.publicKey,
    pricingMatrix: pricingMatrixPda,
    tokenMint: txlMint,
    userTokenAccount,
    tokenTreasuryVault,
    tokenTreasuryPda,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  })
  .preInstructions([createAtaIx])
  .rpc();

console.log('Subscribed on-chain. Add this line to .env:');
console.log('');
console.log(`TXLINE_TX_SIG=${txSig}`);
console.log('');
console.log(`Explorer: https://explorer.solana.com/tx/${txSig}${env.cfg.network === 'devnet' ? '?cluster=devnet' : ''}`);

async function resolveIdl(id: PublicKey): Promise<Idl> {
  const onChain = await Program.fetchIdl(id, provider);
  if (onChain !== null) {
    const withAddress = onChain as Idl & { address?: string };
    if (withAddress.address === undefined) withAddress.address = id.toBase58();
    return withAddress;
  }
  const localPath = resolve(import.meta.dirname, `../idl/txoracle.${env.cfg.network}.json`);
  if (existsSync(localPath)) {
    const local = JSON.parse(readFileSync(localPath, 'utf8')) as Idl & { address?: string };
    if (local.address === undefined) local.address = id.toBase58();
    return local;
  }
  console.error(
    `IDL not found on-chain and no local copy at ${localPath}.\n` +
      `Download it from https://txline.txodds.com/documentation/programs/${env.cfg.network} (JSON tab) ` +
      `and save it to that path.`,
  );
  process.exit(1);
}
