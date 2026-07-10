import { notFound } from 'next/navigation';
import { fetchFixtures } from '../../../lib/api';
import { MatchScreen } from '../../../components/match/match-screen';

export default async function MatchPage({
  params,
}: {
  params: Promise<{ fixtureId: string }>;
}) {
  const { fixtureId: rawFixtureId } = await params;
  const fixtureId = Number.parseInt(rawFixtureId, 10);
  if (!Number.isInteger(fixtureId) || fixtureId <= 0) {
    notFound();
  }

  // Names come from the lobby listing; the live channel carries ids only.
  const listing = await fetchFixtures();
  const fixture = listing.ok
    ? listing.fixtures.find((candidate) => candidate.fixtureId === fixtureId)
    : undefined;

  return (
    <main className="mx-auto w-full max-w-[1060px] px-5 pb-20 sm:px-7.5">
      <MatchScreen
        mode={{ kind: 'live', fixtureId }}
        participant1={fixture?.participant1 ?? 'Home side'}
        participant2={fixture?.participant2 ?? 'Away side'}
        competition={fixture?.competition ?? 'World Cup'}
        startTimeMs={fixture?.startTimeMs ?? 0}
      />
    </main>
  );
}
