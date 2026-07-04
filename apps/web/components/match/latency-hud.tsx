import type { LivePayload } from '@calledit/contracts';

/**
 * The measured real-time claim (differentiator, approved scope): feed emit
 * timestamp to worker arrival, p50 over a rolling 200-sample window.
 */
export function LatencyHud({ latency }: { latency: LivePayload['latency'] }) {
  const scoresP50 = latency.scores?.p50Ms;
  if (scoresP50 === undefined) {
    return null;
  }
  return (
    <span className="tabular inline-flex items-center gap-1.5 font-mono text-xs text-ink-muted">
      <span aria-hidden className="size-1.5 rounded-full bg-accent" />
      feed to screen {scoresP50}ms
    </span>
  );
}
