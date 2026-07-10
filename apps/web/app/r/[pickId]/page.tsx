import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReceiptPayload } from '@calledit/contracts';
import { workerUrl } from '../../../lib/api';
import { EmptyState } from '../../../components/ui/empty-state';
import { Tray } from '../../../components/ui/surface';
import { buttonClassName } from '../../../components/ui/button-styles';
import { ReceiptTicket } from '../../../components/receipt/receipt-ticket';
import { ReceiptActions } from '../../../components/receipt/receipt-actions';

function explorerTxUrl(txSig: string, network: 'mainnet' | 'devnet'): string {
  return `https://explorer.solana.com/tx/${txSig}${network === 'devnet' ? '?cluster=devnet' : ''}`;
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
  if (!/^[0-9a-f-]{36}$/i.test(pickId)) {
    notFound();
  }

  let receipt: ReceiptPayload | null = null;
  let feedDown = false;
  try {
    const response = await fetch(`${workerUrl()}/receipts/${pickId}`, { cache: 'no-store' });
    if (response.status === 404) {
      notFound();
    }
    if (!response.ok) {
      feedDown = true;
    } else {
      receipt = (await response.json()) as ReceiptPayload;
    }
  } catch {
    feedDown = true;
  }

  if (feedDown || receipt === null) {
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
      </div>
    </main>
  );
}
