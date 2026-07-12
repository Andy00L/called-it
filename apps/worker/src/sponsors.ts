import { randomUUID } from 'node:crypto';
import { err, ok, type Result } from '@calledit/txline';
import type {
  SponsorActivation,
  SponsorBoardEntry,
  SponsorPricePreview,
  SponsorQuote,
  SponsorTransactionPayload,
} from '@calledit/contracts';
import {
  PERSISTENCE_ERROR_NOT_PENDING,
  PERSISTENCE_ERROR_TX_USED,
  type PersistencePort,
  type SponsorRecord,
} from './persistence.js';
import type { SponsorPaymentPort } from './sponsor-payments.js';

/**
 * Self-serve sponsorship: anyone can put a name on the lobby ticker by
 * paying SOL to the server wallet. The price is a transparent formula
 * (duration x screen-time tier x current demand), the payment is verified
 * on-chain before anything shows, and every input that ends up rendered on
 * the public site is validated to a tight shape here.
 */

// Base rate: 0.01 SOL per day per weight unit (demo-scale pricing, a
// product choice; the formula, not the number, is the point).
export const BASE_LAMPORTS_PER_DAY = 10_000_000;
// Each already-active sponsorship raises the price by this fraction: the
// board gets more expensive as it gets more crowded (demand pricing).
export const DEMAND_STEP_FRACTION = 0.25;
// Screen-time tiers: how many times the name rides one ticker loop.
const ALLOWED_WEIGHTS = [1, 2, 3] as const;
const MIN_DAYS = 1;
const MAX_DAYS = 30;
// A quote holds its price this long; after that the sponsor re-quotes.
const QUOTE_TTL_MS = 30 * 60 * 1000;
// Same display-name shape the web enforces (apps/web/lib/sponsor.ts): the
// name renders on the public ticker, so the charset stays tight.
const SPONSOR_NAME_PATTERN = /^[\p{L}\p{N} .&-]{2,24}$/u;
const TAGLINE_MAX_CHARS = 80;
// Printable-only tagline (no control characters on the public board).
const TAGLINE_PATTERN = /^[^\p{C}]*$/u;
// The ghost opponent stays unimpersonable on every public surface
// (same guard as player handles, apps/worker/src/game.ts).
const RESERVED_SPONSOR_NAMES = ['the bookie', 'called it'];

/** Memo body binding a payment to one intent (versioned, explorer-readable). */
export function sponsorMemoText(intentId: string): string {
  return `calledit.sponsor.v1:${intentId}`;
}

export interface SponsorServiceDeps {
  persistence: PersistencePort;
  /** Null when the worker runs without a wallet: sponsorship is off. */
  payments: SponsorPaymentPort | null;
  nowMs?: () => number;
}

export interface SponsorService {
  board(): Promise<Result<SponsorBoardEntry[], string>>;
  preview(rawDays: unknown, rawWeight: unknown): Promise<Result<SponsorPricePreview, string>>;
  requestQuote(
    rawName: unknown,
    rawTagline: unknown,
    rawDays: unknown,
    rawWeight: unknown,
  ): Promise<Result<SponsorQuote, string>>;
  buildTransaction(
    sponsorId: string,
    rawPayerPubkey: unknown,
  ): Promise<Result<SponsorTransactionPayload, string>>;
  confirm(sponsorId: string, rawSignature: unknown): Promise<Result<SponsorActivation, string>>;
}

function parseDays(rawDays: unknown): number | null {
  const days = typeof rawDays === 'number' ? rawDays : Number.parseInt(String(rawDays), 10);
  return Number.isInteger(days) && days >= MIN_DAYS && days <= MAX_DAYS ? days : null;
}

function parseWeight(rawWeight: unknown): number | null {
  const weight =
    typeof rawWeight === 'number' ? rawWeight : Number.parseInt(String(rawWeight), 10);
  return (ALLOWED_WEIGHTS as readonly number[]).includes(weight) ? weight : null;
}

/** The transparent price formula; exported so the tests pin it. */
export function sponsorPriceLamports(
  days: number,
  weight: number,
  activeSponsorCount: number,
): number {
  return Math.ceil(
    BASE_LAMPORTS_PER_DAY * days * weight * (1 + DEMAND_STEP_FRACTION * activeSponsorCount),
  );
}

export function createSponsorService(deps: SponsorServiceDeps): SponsorService {
  const nowMs = deps.nowMs ?? Date.now;

  const activeCount = async (): Promise<Result<number, string>> => {
    const listed = await deps.persistence.listActiveSponsors(nowMs());
    return listed.ok ? ok(listed.value.length) : listed;
  };

  const getPendingIntent = async (
    sponsorId: string,
  ): Promise<Result<SponsorRecord, string>> => {
    if (typeof sponsorId !== 'string' || sponsorId === '') {
      return err('unknown_intent');
    }
    const fetched = await deps.persistence.getSponsor(sponsorId);
    if (!fetched.ok) {
      return fetched;
    }
    if (fetched.value === null) {
      return err('unknown_intent');
    }
    return ok(fetched.value);
  };

  return {
    board: async () => {
      const listed = await deps.persistence.listActiveSponsors(nowMs());
      if (!listed.ok) {
        return listed;
      }
      return ok(
        listed.value.map((record) => ({
          name: record.name,
          tagline: record.tagline,
          weight: record.weight,
          endsAtMs: record.endsAtMs ?? 0,
        })),
      );
    },

    preview: async (rawDays, rawWeight) => {
      const days = parseDays(rawDays);
      const weight = parseWeight(rawWeight);
      if (days === null || weight === null) {
        return err(`invalid_terms: days ${MIN_DAYS}-${MAX_DAYS}, weight ${ALLOWED_WEIGHTS.join('/')}`);
      }
      const counted = await activeCount();
      if (!counted.ok) {
        return counted;
      }
      return ok({
        amountLamports: sponsorPriceLamports(days, weight, counted.value),
        days,
        weight,
        activeSponsorCount: counted.value,
        baseLamportsPerDay: BASE_LAMPORTS_PER_DAY,
      });
    },

    requestQuote: async (rawName, rawTagline, rawDays, rawWeight) => {
      if (deps.payments === null) {
        return err('sponsorship_off');
      }
      if (typeof rawName !== 'string' || !SPONSOR_NAME_PATTERN.test(rawName.trim())) {
        return err('invalid_name: 2 to 24 letters, numbers, spaces, . & -');
      }
      const name = rawName.trim();
      if (RESERVED_SPONSOR_NAMES.includes(name.toLowerCase())) {
        return err('invalid_name: reserved name');
      }
      let tagline: string | null = null;
      if (rawTagline !== undefined && rawTagline !== null && rawTagline !== '') {
        if (
          typeof rawTagline !== 'string' ||
          rawTagline.trim().length > TAGLINE_MAX_CHARS ||
          !TAGLINE_PATTERN.test(rawTagline.trim())
        ) {
          return err(`invalid_tagline: up to ${TAGLINE_MAX_CHARS} printable characters`);
        }
        tagline = rawTagline.trim();
      }
      const days = parseDays(rawDays);
      const weight = parseWeight(rawWeight);
      if (days === null || weight === null) {
        return err(`invalid_terms: days ${MIN_DAYS}-${MAX_DAYS}, weight ${ALLOWED_WEIGHTS.join('/')}`);
      }
      const counted = await activeCount();
      if (!counted.ok) {
        return counted;
      }
      const record: SponsorRecord = {
        id: randomUUID(),
        name,
        tagline,
        weight,
        days,
        quoteLamports: sponsorPriceLamports(days, weight, counted.value),
        status: 'pending',
        payerPubkey: null,
        txSig: null,
        paidLamports: null,
        createdAtMs: nowMs(),
        startsAtMs: null,
        endsAtMs: null,
      };
      const created = await deps.persistence.createSponsorIntent(record);
      if (!created.ok) {
        return created;
      }
      return ok({
        intentId: record.id,
        amountLamports: record.quoteLamports,
        recipient: deps.payments.recipient,
        expiresAtMs: record.createdAtMs + QUOTE_TTL_MS,
      });
    },

    buildTransaction: async (sponsorId, rawPayerPubkey) => {
      if (deps.payments === null) {
        return err('sponsorship_off');
      }
      if (typeof rawPayerPubkey !== 'string' || rawPayerPubkey === '') {
        return err('invalid_payer_pubkey');
      }
      const intent = await getPendingIntent(sponsorId);
      if (!intent.ok) {
        return intent;
      }
      if (intent.value.status !== 'pending') {
        return err('already_active');
      }
      if (nowMs() > intent.value.createdAtMs + QUOTE_TTL_MS) {
        return err('intent_expired');
      }
      const built = await deps.payments.buildPaymentTransaction(
        rawPayerPubkey,
        intent.value.quoteLamports,
        sponsorMemoText(intent.value.id),
      );
      if (!built.ok) {
        return built;
      }
      return ok({ transactionBase64: built.value });
    },

    confirm: async (sponsorId, rawSignature) => {
      if (deps.payments === null) {
        return err('sponsorship_off');
      }
      if (typeof rawSignature !== 'string' || rawSignature === '') {
        return err('invalid_signature');
      }
      const intent = await getPendingIntent(sponsorId);
      if (!intent.ok) {
        return intent;
      }
      const record = intent.value;
      // A repeated confirm of an already-activated intent with the same
      // payment is a success, not an error (the client may retry on timeout).
      if (record.status === 'active') {
        if (record.txSig === rawSignature) {
          return ok({
            name: record.name,
            weight: record.weight,
            endsAtMs: record.endsAtMs ?? 0,
          });
        }
        return err('already_active');
      }
      if (nowMs() > record.createdAtMs + QUOTE_TTL_MS) {
        return err('intent_expired');
      }
      const verified = await deps.payments.verifyPayment(
        rawSignature,
        record.quoteLamports,
        sponsorMemoText(record.id),
      );
      if (!verified.ok) {
        return verified;
      }
      const startsAtMs = nowMs();
      const endsAtMs = startsAtMs + record.days * 24 * 60 * 60 * 1000;
      const activated = await deps.persistence.activateSponsor({
        id: record.id,
        txSig: rawSignature,
        payerPubkey: verified.value.payerPubkey,
        paidLamports: verified.value.paidLamports,
        startsAtMs,
        endsAtMs,
      });
      if (!activated.ok) {
        if (activated.error.startsWith(PERSISTENCE_ERROR_TX_USED)) {
          return err('tx_already_used');
        }
        if (activated.error.startsWith(PERSISTENCE_ERROR_NOT_PENDING)) {
          return err('already_active');
        }
        return activated;
      }
      console.log(
        `[confirmSponsor] ${record.name} active for ${record.days}d, weight ${record.weight}, paid ${verified.value.paidLamports} lamports`,
      );
      return ok({ name: record.name, weight: record.weight, endsAtMs });
    },
  };
}
