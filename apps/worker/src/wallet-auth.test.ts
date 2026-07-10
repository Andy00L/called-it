import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PublicKey } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { challengeMessage, createWalletVerifier } from './wallet-auth.js';

function signBase64(message: string, secretKey: Uint8Array): string {
  const signature = nacl.sign.detached(new TextEncoder().encode(message), secretKey);
  return Buffer.from(signature).toString('base64');
}

test('a valid signature over a fresh challenge verifies once', () => {
  const verifier = createWalletVerifier();
  const keyPair = nacl.sign.keyPair();
  const walletPubkey = new PublicKey(keyPair.publicKey).toBase58();

  const challenge = verifier.issueChallenge();
  assert.equal(challenge.message, challengeMessage(challenge.nonce));

  const signature = signBase64(challenge.message, keyPair.secretKey);
  const first = verifier.verify(challenge.nonce, walletPubkey, signature);
  assert.ok(first.ok && first.value.walletPubkey === walletPubkey);

  // Single use: the nonce is consumed, so a replay of the same signature fails.
  const replay = verifier.verify(challenge.nonce, walletPubkey, signature);
  assert.ok(!replay.ok && replay.error === 'challenge_expired');
});

test('a signature from the wrong key is rejected', () => {
  const verifier = createWalletVerifier();
  const owner = nacl.sign.keyPair();
  const attacker = nacl.sign.keyPair();
  const walletPubkey = new PublicKey(owner.publicKey).toBase58();

  const challenge = verifier.issueChallenge();
  const forged = signBase64(challenge.message, attacker.secretKey);
  const result = verifier.verify(challenge.nonce, walletPubkey, forged);
  assert.ok(!result.ok && result.error === 'signature_mismatch');
});

test('a signature over a different message is rejected', () => {
  const verifier = createWalletVerifier();
  const keyPair = nacl.sign.keyPair();
  const walletPubkey = new PublicKey(keyPair.publicKey).toBase58();

  const challenge = verifier.issueChallenge();
  const wrongMessage = signBase64('not the challenge', keyPair.secretKey);
  const result = verifier.verify(challenge.nonce, walletPubkey, wrongMessage);
  assert.ok(!result.ok && result.error === 'signature_mismatch');
});

test('an unknown or expired nonce is rejected', () => {
  let currentMs = 1000;
  const verifier = createWalletVerifier({ nowMs: () => currentMs, ttlMs: 60_000 });
  const keyPair = nacl.sign.keyPair();
  const walletPubkey = new PublicKey(keyPair.publicKey).toBase58();

  const unknown = verifier.verify('never-issued', walletPubkey, 'x');
  assert.ok(!unknown.ok && unknown.error === 'challenge_expired');

  const challenge = verifier.issueChallenge();
  const signature = signBase64(challenge.message, keyPair.secretKey);
  currentMs += 60_001; // past the ttl
  const expired = verifier.verify(challenge.nonce, walletPubkey, signature);
  assert.ok(!expired.ok && expired.error === 'challenge_expired');
});

test('malformed wallet or signature inputs get distinct reasons', () => {
  const verifier = createWalletVerifier();
  const keyPair = nacl.sign.keyPair();

  const badWalletChallenge = verifier.issueChallenge();
  const badWallet = verifier.verify(badWalletChallenge.nonce, 'not-a-pubkey', 'AAAA');
  assert.ok(!badWallet.ok && badWallet.error === 'invalid_wallet');

  const walletPubkey = new PublicKey(keyPair.publicKey).toBase58();
  const badSigChallenge = verifier.issueChallenge();
  const badSig = verifier.verify(badSigChallenge.nonce, walletPubkey, 'too-short');
  assert.ok(!badSig.ok && badSig.error === 'invalid_signature');
});
