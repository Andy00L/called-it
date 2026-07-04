import { Connection, Keypair, sendAndConfirmTransaction, Transaction } from '@solana/web3.js';
import { createMemoInstruction } from '@solana/spl-memo';
import type { MemoPoster } from './commitments.js';

/**
 * Solana Memo poster for commitment roots. The memo body is versioned and
 * self-describing so an explorer reader knows what the hash is.
 */

function buildMemoBody(rootHex: string): string {
  return `calledit.commitment.v1:${rootHex}`;
}

export function createMemoPoster(rpcUrl: string, walletSecret: Uint8Array): MemoPoster {
  const connection = new Connection(rpcUrl, 'confirmed');
  const keypair = Keypair.fromSecretKey(walletSecret);
  console.log(`[createMemoPoster] commitments ENABLED, fee payer ${keypair.publicKey.toBase58()}`);

  return async (rootHex) => {
    try {
      const transaction = new Transaction().add(
        createMemoInstruction(buildMemoBody(rootHex), [keypair.publicKey]),
      );
      const txSig = await sendAndConfirmTransaction(connection, transaction, [keypair], {
        commitment: 'confirmed',
      });
      return { ok: true, txSig };
    } catch (cause) {
      const messageText = cause instanceof Error ? cause.message : String(cause);
      return { ok: false, error: messageText };
    }
  };
}
