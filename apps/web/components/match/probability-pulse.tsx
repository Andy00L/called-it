import type { MatchResultProbabilities } from '@calledit/contracts';

/**
 * Signature element 1 (sheet): the 1X2 market as one segmented bar. The
 * market-favored side wears the accent; the other two segments take the
 * muted bar tones in display order. Full size once at the top of the match
 * screen; a 2px echo on live lobby rows.
 */

type FavoredSide = 'p1' | 'draw' | 'p2';

export function favoredSide(matchResult: MatchResultProbabilities): FavoredSide {
  if (matchResult.p1 >= matchResult.draw && matchResult.p1 >= matchResult.p2) {
    return 'p1';
  }
  return matchResult.p2 >= matchResult.draw ? 'p2' : 'draw';
}

function segmentColors(favored: FavoredSide): [string, string, string] {
  // Favored segment is accent; the rest take mid then low, left to right.
  if (favored === 'p1') {
    return ['bg-accent', 'bg-pulse-mid', 'bg-pulse-low'];
  }
  if (favored === 'draw') {
    return ['bg-pulse-mid', 'bg-accent', 'bg-pulse-low'];
  }
  return ['bg-pulse-mid', 'bg-pulse-low', 'bg-accent'];
}

function pct(fraction: number): string {
  return (fraction * 100).toFixed(1);
}

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
  const favored = favoredSide(matchResult);
  const [colorP1, colorDraw, colorP2] = segmentColors(favored);
  const segments = [
    { key: 'p1', fraction: matchResult.p1, className: colorP1 },
    { key: 'draw', fraction: matchResult.draw, className: colorDraw },
    { key: 'p2', fraction: matchResult.p2, className: colorP2 },
  ];

  const bar = (
    <div
      role="img"
      aria-label={`Win probability: ${participant1} ${pct(matchResult.p1)}%, draw ${pct(matchResult.draw)}%, ${participant2} ${pct(matchResult.p2)}%`}
      className={`flex w-full overflow-hidden rounded-[6px] ${compact ? 'h-0.5' : 'h-2'}`}
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
    <div>
      {bar}
      <p className="tabular mt-2 text-center font-mono text-xs text-ink-muted">
        {participant1}{' '}
        <span className={favored === 'p1' ? 'font-semibold text-accent-deep' : ''}>
          {pct(matchResult.p1)}%
        </span>{' '}
        / draw{' '}
        <span className={favored === 'draw' ? 'font-semibold text-accent-deep' : ''}>
          {pct(matchResult.draw)}%
        </span>{' '}
        / {participant2}{' '}
        <span className={favored === 'p2' ? 'font-semibold text-accent-deep' : ''}>
          {pct(matchResult.p2)}%
        </span>
      </p>
    </div>
  );
}
