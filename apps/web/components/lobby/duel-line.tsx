import type { DuelStats } from '@calledit/contracts';

/**
 * The fans-versus-Bookie line under the lobby hero: the aggregate data
 * product made visible (anonymous counters only, docs/TECH_DOC.md).
 */

// Below this the line reads as noise, not data (a lucky 1-for-1 says
// nothing); the threshold keeps the lobby honest on quiet days.
const DUEL_MIN_SETTLED_CALLS = 3;

export function DuelLine({
  stats,
  className = '',
}: {
  stats: DuelStats | null;
  className?: string;
}) {
  if (stats === null || stats.humanSettled < DUEL_MIN_SETTLED_CALLS) {
    return null;
  }
  return (
    <p className={`text-center text-[13px] text-ink-muted ${className}`}>
      Last 24 hours: fans hit{' '}
      <span className="tabular font-mono font-semibold text-ink">
        {stats.humanHits} of {stats.humanSettled}
      </span>{' '}
      calls. The Bookie hit{' '}
      <span className="tabular font-mono font-semibold text-ink">
        {stats.bookieHits} of {stats.bookieSettled}
      </span>
      .
    </p>
  );
}
