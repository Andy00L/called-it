import assert from 'node:assert/strict';
import { test } from 'node:test';
import { err, ok } from '@calledit/txline';
import { createMemoryPersistence } from './persistence-memory.js';
import type { SponsorPaymentPort } from './sponsor-payments.js';
import {
  BASE_LAMPORTS_PER_DAY,
  createSponsorService,
  sponsorMemoText,
  sponsorPriceLamports,
} from './sponsors.js';

/** Payment port double: records calls, verification outcome is scriptable. */
function createFakePayments(): SponsorPaymentPort & {
  verifications: { signature: string; minLamports: number; memoText: string }[];
  nextVerification: ReturnType<SponsorPaymentPort['verifyPayment']> | null;
} {
  const fake = {
    recipient: 'FakeRecipient1111111111111111111111111111111',
    verifications: [] as { signature: string; minLamports: number; memoText: string }[],
    nextVerification: null as ReturnType<SponsorPaymentPort['verifyPayment']> | null,
    buildPaymentTransaction: async () => ok('ZmFrZS10cmFuc2FjdGlvbg=='),
    verifyPayment: async (signature: string, minLamports: number, memoText: string) => {
      fake.verifications.push({ signature, minLamports, memoText });
      return fake.nextVerification ?? ok({ paidLamports: minLamports, payerPubkey: 'Payer111' });
    },
  };
  return fake;
}

// Base58-shaped signatures (the service only forwards them; shape checks
// live in the real payment port).
const SIGNATURE_A = '5'.repeat(88);
const SIGNATURE_B = '6'.repeat(88);

function createHarness(startMs = 1_000_000) {
  let currentMs = startMs;
  const persistence = createMemoryPersistence();
  const payments = createFakePayments();
  const service = createSponsorService({
    persistence,
    payments,
    network: 'devnet',
    nowMs: () => currentMs,
  });
  return {
    persistence,
    payments,
    service,
    advance: (deltaMs: number) => {
      currentMs += deltaMs;
    },
  };
}

test('the price formula scales with days, weight, and demand', () => {
  assert.equal(sponsorPriceLamports(1, 1, 0), BASE_LAMPORTS_PER_DAY);
  assert.equal(sponsorPriceLamports(7, 2, 0), BASE_LAMPORTS_PER_DAY * 14);
  // Two active sponsors: 1 + 0.25 * 2 = 1.5x demand multiplier.
  assert.equal(sponsorPriceLamports(2, 1, 2), BASE_LAMPORTS_PER_DAY * 3);
});

test('a quote validates every rendered field', async () => {
  const harness = createHarness();
  const badName = await harness.service.requestQuote('<script>', null, 7, 1);
  assert.ok(!badName.ok && badName.error.startsWith('invalid_name'));
  const reserved = await harness.service.requestQuote('The Bookie', null, 7, 1);
  assert.ok(!reserved.ok && reserved.error.startsWith('invalid_name'));
  const badDays = await harness.service.requestQuote('Acme', null, 0, 1);
  assert.ok(!badDays.ok && badDays.error.startsWith('invalid_terms'));
  const badWeight = await harness.service.requestQuote('Acme', null, 7, 9);
  assert.ok(!badWeight.ok && badWeight.error.startsWith('invalid_terms'));
  const badTagline = await harness.service.requestQuote('Acme', 'x'.repeat(90), 7, 1);
  assert.ok(!badTagline.ok && badTagline.error.startsWith('invalid_tagline'));

  const quoted = await harness.service.requestQuote(' Acme Energy ', ' Charge on ', 7, 2);
  assert.ok(quoted.ok);
  assert.equal(quoted.value.amountLamports, BASE_LAMPORTS_PER_DAY * 14);
  assert.equal(quoted.value.recipient, harness.payments.recipient);
  // The quote tells the wallet which chain to settle on (devnet option).
  assert.equal(quoted.value.network, 'devnet');
});

test('a verified payment activates the sponsorship on the board', async () => {
  const harness = createHarness();
  const quoted = await harness.service.requestQuote('Acme', 'Charge on', 7, 2);
  assert.ok(quoted.ok);

  const confirmed = await harness.service.confirm(quoted.value.intentId, SIGNATURE_A);
  assert.ok(confirmed.ok);
  assert.equal(confirmed.value.name, 'Acme');
  // Verification was asked for the quoted amount and the intent-bound memo.
  assert.equal(harness.payments.verifications.length, 1);
  assert.equal(harness.payments.verifications[0]?.minLamports, quoted.value.amountLamports);
  assert.equal(
    harness.payments.verifications[0]?.memoText,
    sponsorMemoText(quoted.value.intentId),
  );

  const board = await harness.service.board();
  assert.ok(board.ok);
  assert.equal(board.value.length, 1);
  assert.equal(board.value[0]?.name, 'Acme');
  assert.equal(board.value[0]?.weight, 2);

  // Demand pricing: the next preview costs more with one active sponsor.
  const preview = await harness.service.preview(7, 2);
  assert.ok(preview.ok);
  assert.equal(preview.value.amountLamports, Math.ceil(BASE_LAMPORTS_PER_DAY * 14 * 1.25));

  // Re-confirming the same intent with the same payment is idempotent.
  const again = await harness.service.confirm(quoted.value.intentId, SIGNATURE_A);
  assert.ok(again.ok);
});

test('one payment cannot activate two sponsorships', async () => {
  const harness = createHarness();
  const first = await harness.service.requestQuote('Acme', null, 1, 1);
  const second = await harness.service.requestQuote('Bcme', null, 1, 1);
  assert.ok(first.ok && second.ok);
  const confirmedFirst = await harness.service.confirm(first.value.intentId, SIGNATURE_A);
  assert.ok(confirmedFirst.ok);
  const reused = await harness.service.confirm(second.value.intentId, SIGNATURE_A);
  // The intent-bound memo already refuses the reuse; the unique tx_sig is
  // the second lock behind it. The fake verifier lets it through to prove
  // the persistence guard alone stops it.
  assert.ok(!reused.ok && reused.error === 'tx_already_used');
});

test('a failed or short payment never activates', async () => {
  const harness = createHarness();
  const quoted = await harness.service.requestQuote('Acme', null, 1, 1);
  assert.ok(quoted.ok);
  harness.payments.nextVerification = Promise.resolve(err('payment_too_small'));
  const short = await harness.service.confirm(quoted.value.intentId, SIGNATURE_B);
  assert.ok(!short.ok && short.error === 'payment_too_small');
  const board = await harness.service.board();
  assert.ok(board.ok);
  assert.equal(board.value.length, 0);
});

test('an expired quote can no longer be paid, and expiry drops the board', async () => {
  const harness = createHarness();
  const quoted = await harness.service.requestQuote('Acme', null, 1, 1);
  assert.ok(quoted.ok);
  harness.advance(31 * 60 * 1000);
  const late = await harness.service.confirm(quoted.value.intentId, SIGNATURE_A);
  assert.ok(!late.ok && late.error === 'intent_expired');

  // A fresh quote paid in time lists until its window ends, then drops.
  const fresh = await harness.service.requestQuote('Acme', null, 1, 1);
  assert.ok(fresh.ok);
  const confirmed = await harness.service.confirm(fresh.value.intentId, SIGNATURE_B);
  assert.ok(confirmed.ok);
  harness.advance(25 * 60 * 60 * 1000);
  const board = await harness.service.board();
  assert.ok(board.ok);
  assert.equal(board.value.length, 0);
});
