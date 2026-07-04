import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { ReceiptPayload } from '@calledit/contracts';
import { workerUrl } from '../../../lib/api';
import { EmptyState } from '../../../components/ui/empty-state';
import { ReceiptTicket } from '../../../components/receipt/receipt-ticket';

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

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-10 sm:px-6">
      {feedDown || receipt === null ? (
        <EmptyState
          title="Receipt unavailable right now"
          detail="The game server did not answer. The receipt is durable; try again in a moment."
        />
      ) : (
        <>
          <ReceiptTicket receipt={receipt} />
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="max-w-md text-xs text-ink-faint">
              This call was hashed and batched into a Merkle root posted on Solana before its
              event resolved. The leaf, the proof path, and the on-chain memo let anyone verify
              the call existed, at this exact market price, ahead of time.
            </p>
            <Link
              href="/"
              className="text-sm text-ink-muted transition-colors duration-[var(--duration-small)] hover:text-ink"
            >
              Play the live matches
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
