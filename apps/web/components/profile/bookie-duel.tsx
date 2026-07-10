'use client';

import type { BookieMargin } from '@calledit/contracts';
import { Card, Tray } from '../ui/surface';
import { Eyebrow } from '../ui/eyebrow';
import { formatPoints } from '../../lib/format';
import { useCountUpNumber } from './count-up';

/**
 * You vs The Bookie (screen 04): the duel scores and the delta line.
 * Ahead is the accent's moment; behind puts the number in miss red and
 * keeps the word in ink.
 */
export function BookieDuel({ bookie }: { bookie: BookieMargin }) {
  const shownYou = useCountUpNumber(bookie.playerPoints);
  const shownBookie = useCountUpNumber(bookie.bookiePoints);
  const margin = bookie.marginPoints;

  return (
    <Tray className="p-2">
      <div className="mx-2.5 mb-2 mt-1.5 flex">
        <Eyebrow>You vs The Bookie</Eyebrow>
      </div>
      <Card className="px-5 py-4.5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-ink-muted">You</p>
            <p className="tabular mt-1 font-mono text-2xl font-semibold">
              {formatPoints(shownYou)}
            </p>
          </div>
          <div>
            <p className="text-xs text-ink-muted">The Bookie</p>
            <p className="tabular mt-1 font-mono text-2xl font-semibold">
              {formatPoints(shownBookie)}
            </p>
          </div>
        </div>
        <div className="rule-dashed mb-3 mt-3.5" />
        <p className="tabular font-mono text-base font-semibold">
          {margin === 0 ? (
            <span className="text-ink">level</span>
          ) : margin > 0 ? (
            <span className="text-accent-deep">+{formatPoints(margin)} ahead</span>
          ) : (
            <>
              <span className="text-miss">{formatPoints(margin)}</span>{' '}
              <span className="text-ink">behind</span>
            </>
          )}
        </p>
        <p className="mt-2 text-[13px] text-ink-muted">
          The Bookie mirrors every call you make with the market favorite.
        </p>
      </Card>
    </Tray>
  );
}
