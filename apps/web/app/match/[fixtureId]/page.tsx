import { notFound } from 'next/navigation';
import { fetchFixtures } from '../../../lib/api';
import { resolveSponsorName } from '../../../lib/sponsor';
import { fetchSponsorBoard } from '../../../lib/sponsor-api';
import { MatchScreen } from '../../../components/match/match-screen';
import { SponsorTicker } from '../../../components/lobby/sponsor-ticker';

export default async function MatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ fixtureId: string }>;
  searchParams: Promise<{ sponsor?: string | string[] }>;
}) {
  const { fixtureId: rawFixtureId } = await params;
  const { sponsor } = await searchParams;
  const fixtureId = Number.parseInt(rawFixtureId, 10);
  if (!Number.isInteger(fixtureId) || fixtureId <= 0) {
    notFound();
  }

  // Names come from the lobby listing; the live channel carries ids only.
  const [listing, sponsorBoard] = await Promise.all([fetchFixtures(), fetchSponsorBoard()]);
  const fixture = listing.ok
    ? listing.fixtures.find((candidate) => candidate.fixtureId === fixtureId)
    : undefined;

  return (
    <main className="mx-auto w-full max-w-[1060px] px-5 pb-20 sm:px-7.5">
      {/* Header board: renders only when someone has paid (product rule). */}
      <div className="pt-3">
        <SponsorTicker sponsors={sponsorBoard} />
      </div>
      <MatchScreen
        mode={{ kind: 'live', fixtureId }}
        participant1={fixture?.participant1 ?? 'Home side'}
        participant2={fixture?.participant2 ?? 'Away side'}
        competition={fixture?.competition ?? 'World Cup'}
        startTimeMs={fixture?.startTimeMs ?? 0}
        sponsorName={resolveSponsorName(sponsor)}
      />
    </main>
  );
}
