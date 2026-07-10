import type { LivePayload } from '@calledit/contracts';

/**
 * The measured real-time claim (differentiator, approved scope): feed emit
 * timestamp to worker arrival, p50 over a rolling window, as a dashed chip.
 */
export function LatencyHud({
  latency,
  connectionLost,
}: {
  latency: LivePayload['latency'] | null;
  connectionLost: boolean;
}) {
  const scoresP50 = latency?.scores?.p50Ms;
  const reading = connectionLost || scoresP50 === undefined ? '…' : `${scoresP50}ms`;
  return (
    <span className="tabular whitespace-nowrap rounded-chip border border-dashed border-hairline px-2 py-[5px] font-mono text-xs text-ink-muted">
      {reading} feed
    </span>
  );
}
