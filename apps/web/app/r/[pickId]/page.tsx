import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchReceipt, isPickIdShaped } from '../../../lib/api';
import { formatPoints, formatProbability } from '../../../lib/format';
import { EmptyState } from '../../../components/ui/empty-state';
import { Tray } from '../../../components/ui/surface';
import { buttonClassName } from '../../../components/ui/button-styles';
import { ReceiptTicket } from '../../../components/receipt/receipt-ticket';
import { ReceiptActions } from '../../../components/receipt/receipt-actions';
import { SAMPLE_SPONSOR } from '../../../lib/sponsor';

function explorerTxUrl(txSig: string, network: 'mainnet' | 'devnet'): string {
  return `https://explorer.solana.com/tx/${txSig}${network === 'devnet' ? '?cluster=devnet' : ''}`;
}

/** Link-unfurl metadata; the card image itself is ./opengraph-image.tsx. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ pickId: string }>;
}): Promise<Metadata> {
  // Crawlers always get a card, even for a dead or unloadable link.
  const fallback: Metadata = { twitter: { card: 'summary_large_image' } };
  const { pickId } = await params;
  if (!isPickIdShaped(pickId)) {
    return fallback;
  }
  const result = await fetchReceipt(pickId);
  if (!result.ok) {
    return fallback;
  }
  const { pick, settlement } = result.receipt;
  const resultText =
    settlement === null
      ? 'Open, settles live.'
      : settlement.outcome === 'hit'
        ? `HIT +${formatPoints(settlement.pointsAwarded)} pts, anchored on Solana.`
        : 'MISS, 0 pts.';
  return {
    title: `CALLED IT: ${pick.claim}`,
    description: `Locked at ${formatProbability(pick.probabilityFraction)}. ${resultText}`,
    twitter: { card: 'summary_large_image' },
  };
}

function WordmarkBar() {
  return (
    <div className="flex py-3">
      <Link
        href="/"
        className="inline-flex min-h-11 items-center border border-hairline px-3.5 text-[15px] font-semibold tracking-[-0.03em] text-ink hover:underline"
      >
        CALLED IT
      </Link>
    </div>
  );
}

// Public share page: no identity required, receipts are public by design
// (db RLS: picks and settlements are world-readable, no secrets on them).
export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ pickId: string }>;
}) {
  const { pickId } = await params;
  // Pick ids are UUIDs; anything else is not found by construction.
  if (!isPickIdShaped(pickId)) {
    notFound();
  }

  const result = await fetchReceipt(pickId);
  if (!result.ok) {
    if (result.reason === 'not_found') {
      notFound();
    }
    return (
      <main className="mx-auto w-full max-w-[640px] px-5 pb-20 sm:px-7.5">
        <WordmarkBar />
        <div className="mt-14">
          <Tray className="p-2">
            <EmptyState
              motif="error"
              title="The receipt did not load"
              action={
                <Link href={`/r/${pickId}`} className={buttonClassName('primary')}>
                  Retry
                </Link>
              }
            />
          </Tray>
        </div>
      </main>
    );
  }

  const receipt = result.receipt;
  const explorerUrl =
    receipt.commitment !== null && receipt.commitment.memoTxSig !== null
      ? explorerTxUrl(receipt.commitment.memoTxSig, receipt.network)
      : null;

  return (
    <main className="mx-auto w-full max-w-[1060px] px-5 pb-20 sm:px-7.5">
      <WordmarkBar />
      <div className="mx-auto mt-14 flex max-w-[640px] flex-col items-center">
        <ReceiptTicket receipt={receipt} />
        <ReceiptActions explorerUrl={explorerUrl} />
        <p className="mt-4.5 text-center text-xs text-ink-muted">
          Solana {receipt.network}. The proof recomputes on every load.
        </p>
        {/* The third ad surface (docs/TECH_DOC.md): the sponsor travels with
            every shared receipt. Same board style as the match cockpit. */}
        <p className="mt-5 flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-ink-muted">
          Match presented by
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-1 rounded-full bg-accent" />
            <span className="text-[11px] font-semibold text-ink">{SAMPLE_SPONSOR}</span>
          </span>
        </p>
      </div>
    </main>
  );
}
