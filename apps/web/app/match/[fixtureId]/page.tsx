import type { Viewport } from 'next';
import { notFound } from 'next/navigation';
import { fetchFixtures } from '../../../lib/api';
import { resolveSponsorName } from '../../../lib/sponsor';
import { fetchSponsorBoard } from '../../../lib/sponsor-api';
import { MatchScreen } from '../../../components/match/match-screen';
import { SponsorTicker } from '../../../components/lobby/sponsor-ticker';
import { BroadcastNav, BroadcastShell } from '../../../components/ui/broadcast-shell';

export const viewport: Viewport = {
  // sourceRef: docs/UI_DESIGN_SYSTEM.md, broadcast night field --cream.
  themeColor: '#0A130C',
};

export default async function MatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ fixtureId: string }>;
  searchParams: Promise<{ sponsor?: string | string[]; terrace?: string | string[] }>;
}) {
  const { fixtureId: rawFixtureId } = await params;
  const { sponsor, terrace } = await searchParams;
  const terraceCode = typeof terrace === 'string' && terrace !== '' ? terrace : null;
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
    <BroadcastShell>
      <BroadcastNav />
      {/* Header board: renders only when someone has paid (product rule). */}
      <div className="mt-4">
        <SponsorTicker sponsors={sponsorBoard} />
      </div>
      <MatchScreen
        mode={{ kind: 'live', fixtureId }}
        participant1={fixture?.participant1 ?? 'Home side'}
        participant2={fixture?.participant2 ?? 'Away side'}
        competition={fixture?.competition ?? 'World Cup'}
        startTimeMs={fixture?.startTimeMs ?? 0}
        sponsorName={resolveSponsorName(sponsor)}
        terraceCode={terraceCode}
      />
    </BroadcastShell>
  );
}
