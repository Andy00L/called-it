import type { Viewport } from 'next';
import Link from 'next/link';
import { fetchFixtures } from '../../../lib/api';
import { fetchTerraceStandings } from '../../../lib/terrace-api';
import { EmptyState } from '../../../components/ui/empty-state';
import { Eyebrow } from '../../../components/ui/eyebrow';
import { PaperPanel } from '../../../components/ui/surface';
import { buttonClassName } from '../../../components/ui/button-styles';
import { BroadcastShell, BroadcastTopBar } from '../../../components/ui/broadcast-shell';
import { TerraceInvite } from '../../../components/terrace/terrace-invite';

export const viewport: Viewport = {
  // sourceRef: docs/UI_DESIGN_SYSTEM.md, broadcast night field --cream.
  themeColor: '#0A130C',
};

export default async function TerraceInvitePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const [standingsResult, listing] = await Promise.all([
    fetchTerraceStandings(code),
    fetchFixtures(),
  ]);

  const fixture =
    standingsResult.ok && listing.ok
      ? listing.fixtures.find(
          (candidate) => candidate.fixtureId === standingsResult.standings.room.fixtureId,
        )
      : undefined;
  const fixtureLine =
    fixture === undefined
      ? null
      : `${fixture.participant1} vs ${fixture.participant2} (${fixture.competition})`;

  return (
    <BroadcastShell>
      <div className="mx-auto w-full max-w-[560px]">
        <BroadcastTopBar eyebrow={<Eyebrow>Group room</Eyebrow>} />
        <PaperPanel>
          <div className="p-3">
            {standingsResult.ok ? (
              <TerraceInvite standings={standingsResult.standings} fixtureLine={fixtureLine} />
            ) : (
              <EmptyState
                motif="error"
                title={
                  standingsResult.reason === 'unknown_terrace' ||
                  standingsResult.reason === 'invalid_terrace_code'
                    ? 'This terrace does not exist'
                    : 'The terrace did not load'
                }
                action={
                  <Link href="/" className={buttonClassName('primary')}>
                    Back to the lobby
                  </Link>
                }
              />
            )}
          </div>
        </PaperPanel>
      </div>
    </BroadcastShell>
  );
}
