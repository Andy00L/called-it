'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { CallOption, GuestSession, PickRecord } from '@calledit/contracts';
import { useLiveMatch } from '../../lib/use-live-match';
import { ensureGuestSession, clearStoredSession } from '../../lib/player';
import { lockPick, LOCK_FAILURE_COPY } from '../../lib/game-api';
import { Skeleton } from '../ui/skeleton';
import { EmptyState } from '../ui/empty-state';
import { Badge } from '../ui/badge';
import { ScoreHeader } from './score-header';
import { ProbabilityPulse } from './probability-pulse';
import { CallCard, type MyPickView } from './call-card';
import { LatencyHud } from './latency-hud';
import { EventFeed } from './event-feed';
import { formatPoints } from '../../lib/format';

interface LockedEntry {
  pick: PickRecord;
  bookieClaim: string | null;
}

function LoadingLayout() {
  return (
    <div className="flex flex-col gap-6" aria-busy>
      <div className="flex flex-col items-center gap-3">
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-10 w-64" />
      </div>
      <Skeleton className="h-2 w-full" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    </div>
  );
}

export function LiveMatch({
  fixtureId,
  participant1,
  participant2,
}: {
  fixtureId: number;
  participant1: string;
  participant2: string;
}) {
  const { payload, connection, settlements } = useLiveMatch(fixtureId);
  const [session, setSession] = useState<GuestSession | null>(null);
  const [lockedByOptionId, setLockedByOptionId] = useState<Map<string, LockedEntry>>(new Map());
  const [lockingOptionId, setLockingOptionId] = useState<string | null>(null);
  const [lockErrors, setLockErrors] = useState<Map<string, string>>(new Map());

  const handleLock = async (option: CallOption): Promise<void> => {
    setLockingOptionId(option.id);
    setLockErrors((previous) => {
      const next = new Map(previous);
      next.delete(option.id);
      return next;
    });

    const ensured = await ensureGuestSession();
    if (!ensured.ok) {
      failLock(option.id, LOCK_FAILURE_COPY[ensured.reason]);
      return;
    }
    setSession(ensured.session);

    let outcome = await lockPick(ensured.session, fixtureId, option.id);
    if (!outcome.ok && outcome.reason === 'auth_failed') {
      // Stored identity no longer valid (wiped server data): start fresh once.
      clearStoredSession();
      const fresh = await ensureGuestSession();
      if (fresh.ok) {
        setSession(fresh.session);
        outcome = await lockPick(fresh.session, fixtureId, option.id);
      }
    }
    if (!outcome.ok) {
      failLock(option.id, LOCK_FAILURE_COPY[outcome.reason]);
      return;
    }

    const entry: LockedEntry = {
      pick: outcome.result.pick,
      bookieClaim: outcome.result.bookiePick?.claim ?? null,
    };
    setLockedByOptionId((previous) => new Map(previous).set(option.id, entry));
    setLockingOptionId(null);
  };

  const failLock = (optionId: string, message: string): void => {
    setLockErrors((previous) => new Map(previous).set(optionId, message));
    setLockingOptionId(null);
  };

  if (payload === null && connection !== 'lost') {
    return <LoadingLayout />;
  }
  if (payload === null) {
    return (
      <EmptyState
        title="No live data for this match yet"
        detail="The stream opens when the data feed first mentions this fixture. If the match is on, this recovers by itself within seconds."
      />
    );
  }

  // Derived, not stored: settlement stream is the source of truth for status.
  const myPickView = (optionId: string): MyPickView | undefined => {
    const locked = lockedByOptionId.get(optionId);
    if (locked === undefined) {
      return undefined;
    }
    const settlement = settlements.find((notice) => notice.pick.id === locked.pick.id);
    return {
      status: settlement === undefined ? 'pending' : settlement.outcome,
      pointsAwarded: settlement === undefined ? null : settlement.pointsAwarded,
      lockProbabilityFraction: locked.pick.probabilityFraction,
      lockClockSeconds: locked.pick.lockClockSeconds,
      bookieClaim: locked.bookieClaim,
    };
  };

  const settledMine = [...lockedByOptionId.values()]
    .map((entry) => ({
      entry,
      settlement: settlements.find((notice) => notice.pick.id === entry.pick.id),
    }))
    .filter((row) => row.settlement !== undefined);

  // Streak comes straight off the settlement stream; no profile fetch needed.
  const latestMySettlement = settledMine
    .map((row) => row.settlement)
    .filter((notice) => notice !== undefined)
    .at(-1);
  const currentStreak = latestMySettlement?.newStreak ?? 0;

  return (
    <div className="flex flex-col gap-6">
      {connection === 'lost' ? (
        <p role="status" className="rounded-chip border border-miss/40 px-3 py-2 text-sm text-miss">
          Connection lost. Reconnecting; the state below may lag the pitch.
        </p>
      ) : null}

      <ScoreHeader payload={payload} participant1={participant1} participant2={participant2} />

      {payload.matchResult !== null ? (
        <ProbabilityPulse
          matchResult={payload.matchResult}
          participant1={participant1}
          participant2={participant2}
        />
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs uppercase tracking-[0.08em] text-ink-muted">Open calls</h2>
          <LatencyHud latency={payload.latency} />
        </div>
        {payload.catalog.length === 0 && lockedByOptionId.size === 0 ? (
          <EmptyState
            title={payload.phase === 'finished' ? 'Full time' : 'Calls open at kickoff'}
            detail={
              payload.phase === 'finished'
                ? 'This match has settled. Replays land with the Time Machine.'
                : 'Calls generate while the clock is running.'
            }
          />
        ) : (
          <div className="flex flex-col gap-3" aria-live="polite">
            {payload.catalog.map((option) => (
              <CallCard
                key={option.id}
                option={option}
                myPick={myPickView(option.id)}
                isLocking={lockingOptionId === option.id}
                lockError={lockErrors.get(option.id)}
                onLock={(picked) => {
                  void handleLock(picked);
                }}
              />
            ))}
          </div>
        )}
        {session !== null ? (
          <p className="text-xs text-ink-faint">
            playing as{' '}
            <Link href="/profile" className="underline decoration-line hover:text-ink-muted">
              {session.handle}
            </Link>
          </p>
        ) : null}
      </section>

      {settledMine.length > 0 ? (
        <section className="flex flex-col gap-3" aria-live="polite">
          <div className="flex items-center justify-between">
            <h2 className="text-xs uppercase tracking-[0.08em] text-ink-muted">Your results</h2>
            {currentStreak > 1 ? <Badge tone="streak">Streak x{currentStreak}</Badge> : null}
          </div>
          <ul className="flex flex-col gap-2">
            {settledMine.map(({ entry, settlement }) => (
              <li key={entry.pick.id} className="flex items-center justify-between gap-3 text-sm">
                <Link
                  href={`/r/${entry.pick.id}`}
                  className="truncate underline decoration-line underline-offset-2 hover:text-ink"
                >
                  {entry.pick.claim}
                </Link>
                {settlement?.outcome === 'hit' ? (
                  <span className="flex items-center gap-2">
                    <Badge tone="live">Called it</Badge>
                    <span className="tabular font-mono font-semibold text-accent">
                      +{formatPoints(settlement.pointsAwarded)}
                    </span>
                  </span>
                ) : (
                  <span className="font-mono text-miss">miss</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-xs uppercase tracking-[0.08em] text-ink-muted">Timeline</h2>
        <EventFeed events={payload.recentEvents} />
      </section>
    </div>
  );
}
