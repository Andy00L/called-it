import Link from 'next/link';
import type { FixtureSummary } from '@calledit/contracts';
import { Badge } from '../ui/badge';
import { Eyebrow } from '../ui/eyebrow';
import { favoredSide, ProbabilityPulse } from '../match/probability-pulse';
import { formatClockMmSs, formatKickoff } from '../../lib/format';

/**
 * Lobby rows (screen 02): live matches are link rows with the 2px pulse
 * echo; upcoming matches are quiet rows with a kickoff time. Rows sit in
 * one white card, separated by dashed hairlines in the parent.
 */

function favoriteName(fixture: FixtureSummary): { name: string; pct: string } | null {
  if (fixture.matchResult === null) {
    return null;
  }
  const side = favoredSide(fixture.matchResult);
  const name =
    side === 'p1' ? fixture.participant1 : side === 'p2' ? fixture.participant2 : 'draw';
  const fraction =
    side === 'p1'
      ? fixture.matchResult.p1
      : side === 'p2'
        ? fixture.matchResult.p2
        : fixture.matchResult.draw;
  return { name, pct: (fraction * 100).toFixed(1) };
}

export function LiveFixtureRow({ fixture }: { fixture: FixtureSummary }) {
  const favorite = favoriteName(fixture);
  return (
    <Link
      href={`/match/${fixture.fixtureId}`}
      aria-label={`${fixture.participant1} vs ${fixture.participant2}, live, ${fixture.goalsP1}-${fixture.goalsP2}`}
      className="block rounded-[6px] bg-card p-4 text-ink transition-[transform,box-shadow] duration-[var(--duration-small)] ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:[box-shadow:var(--shadow-float)] active:scale-[0.99] sm:px-4.5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <Eyebrow size="sm">{fixture.competition}</Eyebrow>
          <h3 className="mt-2 truncate text-xl font-medium tracking-[-0.03em]">
            {fixture.participant1} vs {fixture.participant2}
          </h3>
        </div>
        <div className="flex flex-none flex-col items-end gap-2">
          <div className="flex items-baseline gap-2.5">
            <span className="tabular font-mono text-xl font-semibold">
              {fixture.goalsP1} - {fixture.goalsP2}
            </span>
            <span className="tabular font-mono text-[13px] text-ink-muted">
              {formatClockMmSs(fixture.clockSeconds)}
            </span>
          </div>
          <Badge tone="live">live</Badge>
        </div>
      </div>
      {fixture.matchResult !== null ? (
        <div className="mt-3.5 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <ProbabilityPulse
              matchResult={fixture.matchResult}
              participant1={fixture.participant1}
              participant2={fixture.participant2}
              compact
            />
          </div>
          {favorite !== null ? (
            <span className="tabular flex-none font-mono text-xs text-ink-muted">
              {favorite.name}{' '}
              <span className="font-semibold text-accent-deep">{favorite.pct}%</span>
            </span>
          ) : null}
        </div>
      ) : null}
    </Link>
  );
}

export function UpcomingFixtureRow({ fixture }: { fixture: FixtureSummary }) {
  return (
    <div className="flex items-center justify-between gap-3.5 px-4 py-3.5 sm:px-4.5">
      <div className="min-w-0">
        <Eyebrow size="sm">{fixture.competition}</Eyebrow>
        <p className="mt-1.5 truncate text-base font-medium tracking-[-0.01em]">
          {fixture.participant1} vs {fixture.participant2}
        </p>
      </div>
      <span className="tabular flex-none font-mono text-[13px] text-ink-muted">
        {fixture.startTimeMs > 0 ? formatKickoff(fixture.startTimeMs) : 'scheduled'}
      </span>
    </div>
  );
}
