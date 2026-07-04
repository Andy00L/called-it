import type { MatchResultProbabilities } from '@calledit/contracts';
import { formatProbability } from '../../lib/format';

/**
 * Signature element 1 (sheet): the 1X2 market as one stacked bar. Full size
 * on the match screen; thin echo (no labels) on live lobby cards.
 */
export function ProbabilityPulse({
  matchResult,
  participant1,
  participant2,
  compact = false,
}: {
  matchResult: MatchResultProbabilities;
  participant1: string;
  participant2: string;
  compact?: boolean;
}) {
  const segments = [
    { key: 'p1', fraction: matchResult.p1, className: 'bg-accent' },
    { key: 'draw', fraction: matchResult.draw, className: 'bg-line' },
    { key: 'p2', fraction: matchResult.p2, className: 'bg-ink-muted' },
  ];

  const bar = (
    <div
      role="img"
      aria-label={`Win probability: ${participant1} ${formatProbability(matchResult.p1)}, draw ${formatProbability(matchResult.draw)}, ${participant2} ${formatProbability(matchResult.p2)}`}
      className={`flex w-full overflow-hidden rounded-chip ${compact ? 'h-0.5' : 'h-2'}`}
    >
      {segments.map((segment) => (
        <div
          key={segment.key}
          className={`${segment.className} transition-[flex-grow] duration-[var(--duration-standard)] ease-[var(--ease-standard)]`}
          style={{ flexGrow: Math.max(segment.fraction, 0.001), flexBasis: 0 }}
        />
      ))}
    </div>
  );

  if (compact) {
    return bar;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {bar}
      <div className="tabular flex justify-between font-mono text-xs text-ink-muted">
        <span>
          {participant1} <span className="text-accent">{formatProbability(matchResult.p1)}</span>
        </span>
        <span>draw {formatProbability(matchResult.draw)}</span>
        <span>
          {participant2} {formatProbability(matchResult.p2)}
        </span>
      </div>
    </div>
  );
}
