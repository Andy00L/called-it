import Link from 'next/link';
import type { PickRecord } from '@calledit/contracts';
import { Card, Tray } from '../ui/surface';
import { Eyebrow } from '../ui/eyebrow';
import { buttonClassName } from '../ui/button-styles';
import { formatClockMinutes, formatPoints } from '../../lib/format';

/** One settled call for the final-edition list, whatever its source. */
export interface SettledRow {
  pick: PickRecord;
  outcome: 'hit' | 'miss';
  pointsAwarded: number;
  nearMissSeconds: number | null;
}

/**
 * The full-time recap (peak-end, Kahneman): the best hit leads on an accent
 * plate and carries the share action, misses print their factual near-miss
 * margin, and the session ends on its peak by construction.
 */
export function FinalEditionCard({
  rows,
  bestPickId,
  sessionPoints,
  withReceiptLinks,
}: {
  /** Already ordered: the best call first when one exists. */
  rows: SettledRow[];
  bestPickId: string | null;
  sessionPoints: number;
  /** Live matches link claims and the CTA to /r/{pickId}; replays do not. */
  withReceiptLinks: boolean;
}) {
  return (
    <Tray className="p-2">
      <div className="mx-2.5 mb-2 mt-1.5 flex">
        <Eyebrow>Final edition</Eyebrow>
      </div>
      <Card className="p-4 sm:px-4.5">
        {rows.map((row, index) => {
          const isBest = bestPickId !== null && row.pick.id === bestPickId;
          const claimNode = withReceiptLinks ? (
            <Link
              href={`/r/${row.pick.id}`}
              className="truncate text-sm font-medium underline decoration-hairline underline-offset-2"
            >
              {row.pick.claim}
            </Link>
          ) : (
            <span className="truncate text-sm font-medium">{row.pick.claim}</span>
          );
          return (
            <div key={row.pick.id}>
              {index === 0 ? null : <div className="rule-dashed my-3" />}
              <div className={isBest ? 'rounded-[6px] bg-accent-soft px-3 py-2.5' : ''}>
                {isBest ? (
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-accent-deep">
                    Best call
                  </span>
                ) : null}
                <div className="flex items-baseline justify-between gap-3">
                  {claimNode}
                  <span className="flex flex-none items-baseline gap-2">
                    <span
                      className={`font-mono text-xs font-semibold ${
                        row.outcome === 'hit' ? 'text-accent-deep' : 'text-miss'
                      }`}
                    >
                      {row.outcome}
                    </span>
                    <span
                      className={`tabular font-mono text-sm font-semibold ${
                        row.outcome === 'hit' ? '' : 'text-ink-muted'
                      }`}
                    >
                      {row.outcome === 'hit'
                        ? `+${formatPoints(row.pointsAwarded)} pts`
                        : '0 pts'}
                    </span>
                  </span>
                </div>
                {row.outcome === 'miss' &&
                row.nearMissSeconds !== null &&
                row.pick.predicate.kind === 'event_window' ? (
                  <p className="mt-0.5 text-xs text-ink-muted">
                    so close: the {row.pick.category} came{' '}
                    {formatClockMinutes(row.pick.predicate.toClockSeconds + row.nearMissSeconds)},
                    window closed {formatClockMinutes(row.pick.predicate.toClockSeconds)}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
        <div className="rule-dashed my-3" />
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] text-ink-muted">Points this match</span>
          <span className="tabular font-mono text-base font-semibold">
            {formatPoints(sessionPoints)}
          </span>
        </div>
        {withReceiptLinks && bestPickId !== null ? (
          <div className="mt-3.5 flex justify-center">
            <Link href={`/r/${bestPickId}`} className={buttonClassName('primary')}>
              View the best receipt
            </Link>
          </div>
        ) : null}
      </Card>
    </Tray>
  );
}
