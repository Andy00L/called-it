import type { FixtureSummary } from '@calledit/contracts';
import { fetchFixtures } from '../lib/api';
import { EmptyState } from '../components/ui/empty-state';
import { FixtureCard } from '../components/lobby/fixture-card';

function SectionHeading({ children }: { children: string }) {
  return (
    <h2 className="text-xs uppercase tracking-[0.08em] text-ink-muted">{children}</h2>
  );
}

function FixtureGrid({ fixtures }: { fixtures: FixtureSummary[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {fixtures.map((fixture) => (
        <FixtureCard key={fixture.fixtureId} fixture={fixture} />
      ))}
    </div>
  );
}

export default async function LobbyPage() {
  const result = await fetchFixtures();

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-mono text-2xl font-semibold tracking-tight">CALLED IT</h1>
        <p className="text-sm text-ink-muted">
          Call the match before it happens. The market sets the price.
        </p>
      </header>

      {!result.ok ? (
        <EmptyState
          title="The feed is unreachable"
          detail="The live worker did not answer. It usually recovers on its own; try reloading in a few seconds."
        />
      ) : result.fixtures.length === 0 ? (
        <EmptyState
          title="No matches in the window"
          detail="The World Cup schedule shows here as soon as the data feed lists the next fixtures."
        />
      ) : (
        <LobbySections fixtures={result.fixtures} />
      )}
    </main>
  );
}

function LobbySections({ fixtures }: { fixtures: FixtureSummary[] }) {
  const liveFixtures = fixtures.filter((fixture) => fixture.phase === 'live');
  const upcomingFixtures = fixtures.filter((fixture) => fixture.phase === 'pre');
  const finishedFixtures = fixtures.filter((fixture) => fixture.phase === 'finished');

  return (
    <div className="flex flex-col gap-8">
      {liveFixtures.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionHeading>Live now</SectionHeading>
          <FixtureGrid fixtures={liveFixtures} />
        </section>
      ) : null}
      {upcomingFixtures.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionHeading>Upcoming</SectionHeading>
          <FixtureGrid fixtures={upcomingFixtures} />
        </section>
      ) : null}
      {finishedFixtures.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionHeading>Finished</SectionHeading>
          <FixtureGrid fixtures={finishedFixtures} />
        </section>
      ) : null}
    </div>
  );
}
