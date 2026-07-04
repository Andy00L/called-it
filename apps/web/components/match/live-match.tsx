'use client';

import { useLiveMatch } from '../../lib/use-live-match';
import { Skeleton } from '../ui/skeleton';
import { EmptyState } from '../ui/empty-state';
import { ScoreHeader } from './score-header';
import { ProbabilityPulse } from './probability-pulse';
import { CallCard } from './call-card';
import { LatencyHud } from './latency-hud';
import { EventFeed } from './event-feed';

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
  const { payload, connection } = useLiveMatch(fixtureId);

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
        {payload.catalog.length === 0 ? (
          <EmptyState
            title={payload.phase === 'finished' ? 'Full time' : 'Calls open at kickoff'}
            detail={
              payload.phase === 'finished'
                ? 'This match has settled. Replays land with the Time Machine.'
                : 'Calls generate while the clock is running.'
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            {payload.catalog.map((option) => (
              <CallCard key={option.id} option={option} />
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xs uppercase tracking-[0.08em] text-ink-muted">Timeline</h2>
        <EventFeed events={payload.recentEvents} />
      </section>
    </div>
  );
}
