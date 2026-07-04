import Link from 'next/link';
import type { FixtureSummary } from '@calledit/contracts';
import { Badge } from '../ui/badge';
import { Surface } from '../ui/surface';
import { ProbabilityPulse } from '../match/probability-pulse';
import { formatClockMinutes, formatKickoff } from '../../lib/format';

function PhaseBadge({ fixture }: { fixture: FixtureSummary }) {
  if (fixture.phase === 'live') {
    return <Badge tone="live">Live {formatClockMinutes(fixture.clockSeconds)}</Badge>;
  }
  if (fixture.phase === 'finished') {
    return <Badge tone="finished">Full time</Badge>;
  }
  return (
    <Badge tone="neutral">
      {fixture.startTimeMs > 0 ? formatKickoff(fixture.startTimeMs) : 'Scheduled'}
    </Badge>
  );
}

export function FixtureCard({ fixture }: { fixture: FixtureSummary }) {
  const showsScore = fixture.phase !== 'pre';
  return (
    <Link
      href={`/match/${fixture.fixtureId}`}
      className="block transition-transform duration-[var(--duration-small)] ease-[var(--ease-standard)] hover:-translate-y-0.5"
    >
      <Surface className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs uppercase tracking-[0.08em] text-ink-faint">
            {fixture.competition}
          </span>
          <PhaseBadge fixture={fixture} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1 text-base font-semibold">
            <span className="truncate">{fixture.participant1}</span>
            <span className="truncate">{fixture.participant2}</span>
          </div>
          {showsScore ? (
            <div className="tabular flex flex-col items-end gap-1 font-mono text-2xl">
              <span>{fixture.goalsP1}</span>
              <span>{fixture.goalsP2}</span>
            </div>
          ) : null}
        </div>
        {fixture.phase === 'live' && fixture.matchResult !== null ? (
          <ProbabilityPulse
            matchResult={fixture.matchResult}
            participant1={fixture.participant1}
            participant2={fixture.participant2}
            compact
          />
        ) : null}
      </Surface>
    </Link>
  );
}
