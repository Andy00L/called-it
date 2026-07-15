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
  const isMeasuring = connectionLost || scoresP50 === undefined;
  const reading = isMeasuring ? '…' : `${scoresP50}ms`;
  return (
    <span className="tabular inline-flex items-center gap-1.5 whitespace-nowrap rounded-chip border border-dashed border-hairline px-2.5 py-[5px] font-mono text-xs text-ink-muted">
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${
          isMeasuring
            ? 'bg-[var(--ink-faint)]'
            : 'bg-[var(--bc-live)] [animation:dot-pulse_1.8s_var(--ease-standard)_infinite]'
        }`}
      />
      {reading} feed
    </span>
  );
}
