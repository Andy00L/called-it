import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import { createMemoInstruction } from '@solana/spl-memo';
import { err, ok, type Result } from '@calledit/txline';

/**
 * SOL payment rails for self-serve sponsorships. The worker builds an
 * UNSIGNED transfer (payer -> server wallet, plus a memo binding the payment
 * to one intent); the sponsor's wallet signs and sends it client-side; the
 * worker then verifies the landed transaction on-chain before activating
 * anything. The server wallet key never signs sponsor payments; it only
 * derives the recipient address.
 */

export interface SponsorPaymentVerification {
  paidLamports: number;
  payerPubkey: string;
}

export interface SponsorPaymentPort {
  /** Base58 address sponsor payments must reach. */
  recipient: string;
  buildPaymentTransaction(
    payerPubkey: string,
    amountLamports: number,
    memoText: string,
  ): Promise<Result<string, string>>;
  /**
   * Verify a landed payment: confirmed, no error, moved at least the quoted
   * lamports to the recipient, and carries the exact memo. Distinct errors:
   * `payment_pending` (not visible yet, retry), `tx_failed`,
   * `payment_too_small`, `memo_mismatch`, `invalid_signature`.
   */
  verifyPayment(
    signature: string,
    minLamports: number,
    memoText: string,
  ): Promise<Result<SponsorPaymentVerification, string>>;
}

// Base58 shape of a transaction signature (64 bytes encoded).
const SIGNATURE_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{80,90}$/;

export function createSponsorPayments(
  rpcUrl: string,
  walletSecret: Uint8Array,
): SponsorPaymentPort {
  const connection = new Connection(rpcUrl, 'confirmed');
  const recipientPubkey = Keypair.fromSecretKey(walletSecret).publicKey;

  return {
    recipient: recipientPubkey.toBase58(),

    buildPaymentTransaction: async (payerPubkey, amountLamports, memoText) => {
      let payer: PublicKey;
      try {
        payer = new PublicKey(payerPubkey);
      } catch {
        return err('invalid_payer_pubkey');
      }
      try {
        const { blockhash } = await connection.getLatestBlockhash('finalized');
        const transaction = new Transaction({
          feePayer: payer,
          recentBlockhash: blockhash,
        })
          .add(
            SystemProgram.transfer({
              fromPubkey: payer,
              toPubkey: recipientPubkey,
              lamports: amountLamports,
            }),
          )
          .add(createMemoInstruction(memoText, [payer]));
        const serialized = transaction.serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        });
        return ok(serialized.toString('base64'));
      } catch (cause) {
        const messageText = cause instanceof Error ? cause.message : String(cause);
        return err(`transaction build failed: ${messageText}`);
      }
    },

    verifyPayment: async (signature, minLamports, memoText) => {
      if (!SIGNATURE_PATTERN.test(signature)) {
        return err('invalid_signature');
      }
      let response;
      try {
        response = await connection.getTransaction(signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0,
        });
      } catch (cause) {
        const messageText = cause instanceof Error ? cause.message : String(cause);
        return err(`payment lookup failed: ${messageText}`);
      }
      if (response === null || response.meta === null) {
        // Not visible at confirmed commitment yet; the client retries.
        return err('payment_pending');
      }
      if (response.meta.err !== null) {
        return err('tx_failed');
      }
      // The memo program logs its content verbatim; the exact line binds this
      // payment to exactly one intent id. Reusing the tx on another intent
      // fails here, and reusing it on the SAME intent is stopped by the
      // unique tx_sig constraint at activation.
      const expectedMemoLog = `Program log: Memo (len ${memoText.length}): "${memoText}"`;
      const memoMatches = (response.meta.logMessages ?? []).includes(expectedMemoLog);
      if (!memoMatches) {
        return err('memo_mismatch');
      }
      const accountKeys = response.transaction.message.getAccountKeys({
        accountKeysFromLookups: response.meta.loadedAddresses ?? undefined,
      });
      const recipientIndex = accountKeys
        .keySegments()
        .flat()
        .findIndex((key) => key.equals(recipientPubkey));
      if (recipientIndex < 0) {
        return err('payment_too_small');
      }
      const preBalance = response.meta.preBalances[recipientIndex] ?? 0;
      const postBalance = response.meta.postBalances[recipientIndex] ?? 0;
      const paidLamports = postBalance - preBalance;
      if (paidLamports < minLamports) {
        return err('payment_too_small');
      }
      const payerKey = accountKeys.keySegments().flat()[0];
      if (payerKey === undefined) {
        return err('tx_failed');
      }
      return ok({ paidLamports, payerPubkey: payerKey.toBase58() });
    },
  };
}
