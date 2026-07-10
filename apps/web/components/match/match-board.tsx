'use client';

import { useEffect, useState } from 'react';
import type { FixtureLeaderboardEntry } from '@calledit/contracts';
import { fetchFixtureLeaderboard } from '../../lib/api';
import { Badge } from '../ui/badge';
import { Card, Tray } from '../ui/surface';
import { Eyebrow } from '../ui/eyebrow';
import { formatPoints } from '../../lib/format';

const SHOWN_ROWS = 5;

/**
 * "This match" (screen 01, right rail): the per-fixture standings, refreshed
 * whenever a settlement lands. useEffect is justified: worker HTTP fetch (an
 * external system) with abort cleanup, retriggered by settlement count.
 */
export function MatchBoard({
  fixtureId,
  youPlayerId,
  settlementCount,
}: {
  fixtureId: number;
  youPlayerId: string | null;
  settlementCount: number;
}) {
  const [entries, setEntries] = useState<FixtureLeaderboardEntry[] | null>(null);

  useEffect(() => {
    const abortController = new AbortController();
    const load = async (): Promise<void> => {
      const fetched = await fetchFixtureLeaderboard(fixtureId);
      if (abortController.signal.aborted || !fetched.ok) {
        return;
      }
      setEntries(fetched.entries);
    };
    void load();
    return () => abortController.abort();
  }, [fixtureId, settlementCount]);

  if (entries === null || entries.length === 0) {
    return null;
  }

  return (
    <section aria-label="This match">
      <Tray className="p-2">
        <div className="mx-2.5 mb-2 mt-1.5 flex">
          <Eyebrow>This match</Eyebrow>
        </div>
        <Card className="p-1.5">
          {entries.slice(0, SHOWN_ROWS).map((entry, index) => {
            const isYou = youPlayerId !== null && entry.playerId === youPlayerId;
            return (
              <div key={entry.playerId} className={index === 0 ? '' : 'rule-dashed'}>
                <div
                  className={`flex items-center gap-3 rounded-chip p-3 ${
                    isYou ? 'bg-accent-soft' : ''
                  }`}
                >
                  <span className="tabular w-4 font-mono text-xs text-ink-muted">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {entry.handle}
                  </span>
                  {isYou ? <Badge tone="you">you</Badge> : null}
                  <span className="tabular font-mono text-sm font-semibold">
                    {formatPoints(entry.fixturePoints)}
                  </span>
                </div>
              </div>
            );
          })}
        </Card>
      </Tray>
    </section>
  );
}
