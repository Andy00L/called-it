import type {
  SponsorActivation,
  SponsorBoardEntry,
  SponsorPricePreview,
  SponsorQuote,
  SponsorTransactionPayload,
} from '@calledit/contracts';
import { workerUrl } from './api';

/** Client for the self-serve sponsorship routes. Failures stay distinct. */

export type SponsorApiFailure =
  | 'invalid'
  | 'unknown_intent'
  | 'intent_expired'
  | 'already_active'
  | 'tx_already_used'
  | 'payment_pending'
  | 'payment_too_small'
  | 'memo_mismatch'
  | 'tx_failed'
  | 'sponsorship_off'
  | 'network'
  | 'server';

const KNOWN_SPONSOR_FAILURES: readonly SponsorApiFailure[] = [
  'unknown_intent',
  'intent_expired',
  'already_active',
  'tx_already_used',
  'payment_pending',
  'payment_too_small',
  'memo_mismatch',
  'tx_failed',
  'sponsorship_off',
];

function toSponsorFailure(code: string): SponsorApiFailure {
  if ((KNOWN_SPONSOR_FAILURES as readonly string[]).includes(code)) {
    return code as SponsorApiFailure;
  }
  return code.startsWith('invalid_') ? 'invalid' : 'server';
}

type SponsorApiResult<Value> =
  | { ok: true; value: Value }
  | { ok: false; reason: SponsorApiFailure; detail: string };

async function postSponsor<Value>(
  path: string,
  body: Record<string, unknown>,
): Promise<SponsorApiResult<Value>> {
  let response: Response;
  try {
    response = await fetch(`${workerUrl()}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, reason: 'network', detail: '' };
  }
  if (response.ok) {
    try {
      return { ok: true, value: (await response.json()) as Value };
    } catch {
      return { ok: false, reason: 'server', detail: '' };
    }
  }
  try {
    const errorBody = (await response.json()) as { error?: string };
    const code = errorBody.error ?? '';
    return { ok: false, reason: toSponsorFailure(code), detail: code };
  } catch {
    return { ok: false, reason: 'server', detail: '' };
  }
}

/** The active board for the lobby ticker; empty on any failure (the band
 *  then sells itself). */
export async function fetchSponsorBoard(): Promise<SponsorBoardEntry[]> {
  try {
    const response = await fetch(`${workerUrl()}/sponsors/active`, { cache: 'no-store' });
    if (!response.ok) {
      return [];
    }
    const payload = (await response.json()) as { sponsors: SponsorBoardEntry[] };
    return Array.isArray(payload.sponsors) ? payload.sponsors : [];
  } catch {
    return [];
  }
}

export function previewSponsorPrice(
  days: number,
  weight: number,
): Promise<SponsorApiResult<SponsorPricePreview>> {
  return postSponsor('/sponsors/preview', { days, weight });
}

export function requestSponsorQuote(input: {
  name: string;
  tagline: string;
  days: number;
  weight: number;
}): Promise<SponsorApiResult<SponsorQuote>> {
  return postSponsor('/sponsors/quote', input);
}

export function fetchSponsorTransaction(
  intentId: string,
  payerPubkey: string,
): Promise<SponsorApiResult<SponsorTransactionPayload>> {
  return postSponsor(`/sponsors/${intentId}/transaction`, { payerPubkey });
}

export function confirmSponsor(
  intentId: string,
  signature: string,
): Promise<SponsorApiResult<SponsorActivation>> {
  return postSponsor(`/sponsors/${intentId}/confirm`, { signature });
}

/** Player-facing copy per failure mode (distinct, actionable). */
export const SPONSOR_FAILURE_COPY: Record<SponsorApiFailure, string> = {
  invalid: 'Check the form: name 2 to 24 plain characters, tagline up to 80.',
  unknown_intent: 'This quote is gone. Start over to get a fresh price.',
  intent_expired: 'This quote expired (prices hold 30 minutes). Get a fresh one.',
  already_active: 'This slot is already paid and live.',
  tx_already_used: 'That payment already activated another sponsorship.',
  payment_pending: 'The chain has not confirmed the payment yet.',
  payment_too_small: 'The payment landed short of the quoted amount.',
  memo_mismatch: 'That transaction does not reference this quote.',
  tx_failed: 'The transaction failed on-chain. Nothing was charged.',
  sponsorship_off: 'Sponsorship is not available right now.',
  network: 'Could not reach the game server. Check your connection and retry.',
  server: 'The game server had a hiccup. Retry in a moment.',
};

/** Lamports to a display SOL amount (tabular mono at the call sites). */
export function formatSol(lamports: number): string {
  return (lamports / 1_000_000_000).toFixed(3);
}
