'use client';

import { useEffect, useState } from 'react';
import type { LeaderboardEntry } from '@calledit/contracts';
import { readStoredSession } from '../../lib/player';
import { Badge } from '../ui/badge';
import { Card, Tray } from '../ui/surface';
import { formatPoints } from '../../lib/format';

// Streak chips appear at x2 and up (screen 05 brief).
const STREAK_CHIP_MIN = 2;
const TOP_RANK_COUNT = 3;

/**
 * The standings table (screen 05): dense 52px rows, dashed separators,
 * accent-deep top-3 ranks, and the reader's own row highlighted (found via
 * the stored guest identity after mount, so the server render stays pure).
 */
export function Standings({ entries }: { entries: LeaderboardEntry[] }) {
  const [youPlayerId, setYouPlayerId] = useState<string | null>(null);

  // The stored identity is client-only; read it once after mount.
  useEffect(() => {
    setYouPlayerId(readStoredSession()?.playerId ?? null);
  }, []);

  return (
    <Tray className="p-2">
      <Card className="overflow-hidden">
        {entries.map((entry, index) => {
          const isYou = youPlayerId !== null && entry.playerId === youPlayerId;
          const isTopRank = index < TOP_RANK_COUNT;
          return (
            <div
              key={entry.playerId}
              className={`relative flex min-h-13 items-center gap-3 border-l-2 px-4 [animation:row-in_var(--duration-standard)_var(--ease-enter)_both] ${
                index === 0 ? '' : 'rule-dashed'
              } ${isYou ? 'border-l-accent' : 'border-l-transparent'}`}
              style={{ animationDelay: `${index * 40}ms` }}
            >
              {isYou ? (
                <span
                  aria-hidden
                  className="absolute inset-0 bg-accent-soft [animation:you-flash_var(--duration-hero)_var(--ease-standard)_both]"
                  style={{ animationDelay: `${index * 40 + 280}ms` }}
                />
              ) : null}
              <span
                className={`tabular relative w-[2ch] flex-none text-right font-mono text-[13px] ${
                  isTopRank ? 'font-semibold text-accent-deep' : 'text-ink-muted'
                }`}
              >
                {index + 1}
              </span>
              <span className="relative min-w-0 truncate text-base font-medium">{entry.handle}</span>
              {entry.currentStreak >= STREAK_CHIP_MIN ? (
                <span className="tabular relative flex-none rounded-chip border border-hairline px-1.5 py-0.5 font-mono text-[11px] text-ink">
                  x{entry.currentStreak}
                </span>
              ) : null}
              {isYou ? <Badge tone="you" className="relative" >you</Badge> : null}
              <span className="tabular relative ml-auto flex-none font-mono text-sm font-semibold">
                {formatPoints(entry.totalPoints)}
              </span>
            </div>
          );
        })}
        <div className="rule-dashed px-4 py-3">
          <p className="text-xs text-ink-muted">
            <span className="tabular font-mono">{entries.length}</span> players shown. The Bookie
            plays every match but never ranks.
          </p>
        </div>
      </Card>
    </Tray>
  );
}
