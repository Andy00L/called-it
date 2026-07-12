'use client';

import { useEffect, useState } from 'react';
import type { SponsorActivation, SponsorPricePreview, SponsorQuote } from '@calledit/contracts';
import {
  confirmSponsor,
  fetchSponsorTransaction,
  formatSol,
  previewSponsorPrice,
  requestSponsorQuote,
  SPONSOR_FAILURE_COPY,
  type SponsorApiFailure,
} from '../../lib/sponsor-api';
import {
  connectAndSendTransaction,
  type SolanaWalletEntry,
  type WalletPayFailure,
} from '../../lib/solana-wallets';
import { Button } from '../ui/button';
import { Card, Tray } from '../ui/surface';
import { Eyebrow } from '../ui/eyebrow';
import { WalletPicker } from '../ui/wallet-picker';

/**
 * The self-serve sponsorship flow: terms -> transparent price -> quote ->
 * wallet pays -> the chain confirms -> the name is on the board. Every
 * price shown comes from the worker (the formula is public); the client
 * never computes money.
 */

// Offered durations (days); the worker enforces the 1..30 bound.
const DURATION_CHOICES = [1, 3, 7, 14, 30] as const;

interface TierChoice {
  weight: number;
  label: string;
  detail: string;
}

const TIER_CHOICES: TierChoice[] = [
  { weight: 1, label: 'Standard', detail: 'rides the loop once' },
  { weight: 2, label: 'Double', detail: 'rides the loop twice' },
  { weight: 3, label: 'Triple', detail: 'rides the loop three times' },
];

// The chain usually confirms within a few seconds; poll a little longer
// before telling the sponsor to retry by hand.
const CONFIRM_ATTEMPTS = 10;
const CONFIRM_INTERVAL_MS = 2500;

const WALLET_PAY_COPY: Record<WalletPayFailure, string> = {
  no_wallet: 'No Solana wallet found in this browser. Install Phantom, then reload.',
  rejected: 'The wallet declined. Nothing was charged.',
  unsupported: 'That wallet cannot send transactions here. Try Phantom or Solflare.',
  build_failed: 'Could not prepare the transaction. Get a fresh quote and retry.',
};

type FlowPhase =
  | { kind: 'editing' }
  | { kind: 'quoting' }
  | { kind: 'paying'; walletName: string }
  | { kind: 'confirming' }
  | { kind: 'done'; activation: SponsorActivation }
  | { kind: 'error'; message: string };

function waitMs(delayMs: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, delayMs));
}

export function SponsorForm() {
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [days, setDays] = useState<number>(7);
  const [weight, setWeight] = useState<number>(1);
  const [preview, setPreview] = useState<SponsorPricePreview | null>(null);
  const [quote, setQuote] = useState<SponsorQuote | null>(null);
  const [phase, setPhase] = useState<FlowPhase>({ kind: 'editing' });

  // Live price for the chosen terms (external system: worker HTTP; the
  // price moves with demand, so it is fetched, never computed here).
  useEffect(() => {
    const abortController = new AbortController();
    const loadPreview = async (): Promise<void> => {
      const fetched = await previewSponsorPrice(days, weight);
      if (!abortController.signal.aborted && fetched.ok) {
        setPreview(fetched.value);
      }
    };
    void loadPreview();
    return () => abortController.abort();
  }, [days, weight]);

  const failWith = (reason: SponsorApiFailure): void => {
    setPhase({ kind: 'error', message: SPONSOR_FAILURE_COPY[reason] });
    // An expired or consumed quote cannot be retried; force a fresh one.
    if (reason === 'intent_expired' || reason === 'unknown_intent') {
      setQuote(null);
    }
  };

  const handleQuote = async (): Promise<void> => {
    setPhase({ kind: 'quoting' });
    const quoted = await requestSponsorQuote({ name, tagline, days, weight });
    if (!quoted.ok) {
      failWith(quoted.reason);
      return;
    }
    setQuote(quoted.value);
    setPhase({ kind: 'editing' });
  };

  const handlePay = async (wallet: SolanaWalletEntry): Promise<void> => {
    if (quote === null) {
      return;
    }
    const intentId = quote.intentId;
    setPhase({ kind: 'paying', walletName: wallet.name });
    // The quote decides the chain: a devnet worker sells devnet slots.
    const sent = await connectAndSendTransaction(
      wallet.id,
      `solana:${quote.network}`,
      async (payerPubkey) => {
        const built = await fetchSponsorTransaction(intentId, payerPubkey);
        return built.ok ? built.value.transactionBase64 : null;
      },
    );
    if (!sent.ok) {
      setPhase({ kind: 'error', message: WALLET_PAY_COPY[sent.reason] });
      return;
    }
    setPhase({ kind: 'confirming' });
    for (let attempt = 0; attempt < CONFIRM_ATTEMPTS; attempt += 1) {
      const confirmed = await confirmSponsor(intentId, sent.signatureBase58);
      if (confirmed.ok) {
        setPhase({ kind: 'done', activation: confirmed.value });
        return;
      }
      if (confirmed.reason !== 'payment_pending' && confirmed.reason !== 'network') {
        failWith(confirmed.reason);
        return;
      }
      await waitMs(CONFIRM_INTERVAL_MS);
    }
    setPhase({
      kind: 'error',
      message: 'The payment went out but the chain is slow to confirm. Reload in a minute; your slot activates as soon as it lands.',
    });
  };

  if (phase.kind === 'done') {
    return (
      <Tray className="p-2">
        <div className="mx-2.5 mb-2 mt-1.5 flex">
          <Eyebrow>On the board</Eyebrow>
        </div>
        <Card className="flex flex-col items-center gap-2 px-5 py-8 text-center">
          <p className="font-mono text-lg font-semibold uppercase tracking-[0.14em] text-accent-deep">
            {phase.activation.name}
          </p>
          <p className="text-sm text-ink-muted">
            is riding the lobby board until{' '}
            <span className="tabular font-mono text-ink">
              {new Intl.DateTimeFormat(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }).format(new Date(phase.activation.endsAtMs))}
            </span>
            . Payment verified on-chain.
          </p>
        </Card>
      </Tray>
    );
  }

  const isBusy =
    phase.kind === 'quoting' || phase.kind === 'paying' || phase.kind === 'confirming';
  const fieldClasses =
    'w-full rounded-chip border border-hairline bg-card px-3 py-2.5 text-sm text-ink placeholder:text-ink-faint';

  return (
    <Tray className="p-2">
      <div className="mx-2.5 mb-2 mt-1.5 flex">
        <Eyebrow>Book the board</Eyebrow>
      </div>
      <Card className="flex flex-col gap-4 px-5 py-4.5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="sponsor-name" className="text-[13px] font-medium text-ink">
            Name on the board
          </label>
          <input
            id="sponsor-name"
            type="text"
            value={name}
            maxLength={24}
            placeholder="Acme Energy"
            disabled={isBusy || quote !== null}
            onChange={(event) => setName(event.target.value)}
            className={fieldClasses}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="sponsor-tagline" className="text-[13px] font-medium text-ink">
            Tagline <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <input
            id="sponsor-tagline"
            type="text"
            value={tagline}
            maxLength={80}
            placeholder="Charge on"
            disabled={isBusy || quote !== null}
            onChange={(event) => setTagline(event.target.value)}
            className={fieldClasses}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink">Duration</span>
          <div role="radiogroup" aria-label="Duration" className="flex flex-wrap gap-2">
            {DURATION_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                role="radio"
                aria-checked={days === choice}
                disabled={isBusy || quote !== null}
                onClick={() => setDays(choice)}
                className={`tabular min-h-10 rounded-chip border px-3.5 font-mono text-sm transition-transform duration-[var(--duration-micro)] ease-[var(--ease-standard)] active:scale-[0.97] ${
                  days === choice
                    ? 'border-accent-line bg-accent-soft font-semibold text-accent-deep'
                    : 'border-hairline bg-card text-ink'
                }`}
              >
                {choice}d
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium text-ink">Screen time</span>
          <div role="radiogroup" aria-label="Screen time" className="flex flex-col gap-2 sm:flex-row">
            {TIER_CHOICES.map((tier) => (
              <button
                key={tier.weight}
                type="button"
                role="radio"
                aria-checked={weight === tier.weight}
                disabled={isBusy || quote !== null}
                onClick={() => setWeight(tier.weight)}
                className={`flex min-h-11 flex-1 flex-col items-start justify-center rounded-chip border px-3.5 py-2 text-left transition-transform duration-[var(--duration-micro)] ease-[var(--ease-standard)] active:scale-[0.97] ${
                  weight === tier.weight
                    ? 'border-accent-line bg-accent-soft'
                    : 'border-hairline bg-card'
                }`}
              >
                <span
                  className={`text-sm font-medium ${
                    weight === tier.weight ? 'text-accent-deep' : 'text-ink'
                  }`}
                >
                  {tier.label}
                </span>
                <span className="text-xs text-ink-muted">{tier.detail}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rule-dashed pt-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] text-ink-muted">
              {quote !== null ? 'Locked price (30 min)' : 'Live price'}
            </span>
            <span className="tabular font-mono text-xl font-semibold text-ink">
              {quote !== null
                ? formatSol(quote.amountLamports)
                : preview !== null
                  ? formatSol(preview.amountLamports)
                  : '...'}{' '}
              <span className="text-[12px] font-medium text-ink-muted">SOL</span>
            </span>
          </div>
          {preview !== null && quote === null ? (
            <p className="mt-1 text-xs text-ink-muted">
              {formatSol(preview.baseLamportsPerDay)} SOL per day, times {days} days, times the{' '}
              {weight}x tier, times demand ({preview.activeSponsorCount} active sponsor
              {preview.activeSponsorCount === 1 ? '' : 's'}).
            </p>
          ) : null}
        </div>

        {quote === null ? (
          <Button
            variant="primary"
            isLoading={phase.kind === 'quoting'}
            disabled={name.trim().length < 2}
            onClick={() => {
              void handleQuote();
            }}
          >
            Lock this price
          </Button>
        ) : (
          <div className="flex flex-col gap-2">
            <WalletPicker
              label={`Pay ${formatSol(quote.amountLamports)} SOL with a wallet`}
              variant="primary"
              isWorking={phase.kind === 'paying' || phase.kind === 'confirming'}
              workingLabel={
                phase.kind === 'paying'
                  ? `Waiting for ${phase.walletName}...`
                  : 'Confirming on-chain...'
              }
              errorMessage={null}
              onPick={(wallet) => {
                void handlePay(wallet);
              }}
            />
            <p className="text-xs text-ink-muted">
              The wallet signs one transfer on Solana{' '}
              <span className="font-mono">{quote.network}</span> to the game wallet, with this
              quote's reference in the memo. The slot activates once the chain confirms.
            </p>
          </div>
        )}

        {phase.kind === 'error' ? (
          <p role="alert" className="text-xs text-miss">
            {phase.message}
          </p>
        ) : null}
      </Card>
    </Tray>
  );
}
