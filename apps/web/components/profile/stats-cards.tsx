'use client';

import { streakMultiplier } from '@calledit/contracts';
import { Card, Tray } from '../ui/surface';
import { Eyebrow } from '../ui/eyebrow';
import { formatMultiplier, formatPoints } from '../../lib/format';
import { useCountUpNumber } from './count-up';

function StreakFlame() {
  return (
    <svg aria-label="Streak flame" width="13" height="15" viewBox="0 0 12 14" fill="var(--streak)">
      <path d="M6 0c.5 2.5 3.5 4 3.5 8a3.5 3.5 0 0 1-7 0c0-1.5.7-2.6 1.5-3.5.3 1.5 1.5 2 1.5 2C5 4 5.5 1.8 6 0z" />
    </svg>
  );
}

/**
 * The three stat plates (screen 04): total points, current streak (the one
 * amber moment of this screen), best streak. Numbers count up on enter.
 */
export function StatsCards({
  totalPoints,
  currentStreak,
  bestStreak,
}: {
  totalPoints: number;
  currentStreak: number;
  bestStreak: number;
}) {
  const shownTotal = useCountUpNumber(totalPoints);
  const shownCurrent = useCountUpNumber(currentStreak);
  const shownBest = useCountUpNumber(bestStreak);

  return (
    <Tray className="p-2">
      <div className="flex flex-wrap gap-2">
        <Card className="min-w-0 flex-[1_1_150px] p-4">
          <Eyebrow size="sm">Total points</Eyebrow>
          <div className="tabular mt-2.5 font-mono text-[28px] font-semibold">
            {formatPoints(shownTotal)}
          </div>
        </Card>
        <Card className="min-w-0 flex-[1_1_150px] p-4">
          <Eyebrow size="sm">Current streak</Eyebrow>
          <div className="mt-2.5 flex items-center gap-2">
            <span className="tabular font-mono text-[28px] font-semibold">{shownCurrent}</span>
            {currentStreak > 0 ? <StreakFlame /> : null}
          </div>
          {currentStreak > 0 ? (
            <p className="mt-1.5 text-xs text-ink-muted">
              {formatMultiplier(streakMultiplier(currentStreak))} on the next hit
            </p>
          ) : null}
        </Card>
        <Card className="min-w-0 flex-[1_1_150px] p-4">
          <Eyebrow size="sm">Best streak</Eyebrow>
          <div className="tabular mt-2.5 font-mono text-[28px] font-semibold">{shownBest}</div>
        </Card>
      </div>
    </Tray>
  );
}
