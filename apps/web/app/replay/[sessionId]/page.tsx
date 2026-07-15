import type { Viewport } from 'next';
import Link from 'next/link';
import { fetchReplayTapes } from '../../../lib/api';
import { fetchReplaySession } from '../../../lib/replay-api';
import { resolveSponsorName } from '../../../lib/sponsor';
import { fetchSponsorBoard } from '../../../lib/sponsor-api';
import { MatchScreen } from '../../../components/match/match-screen';
import { SponsorTicker } from '../../../components/lobby/sponsor-ticker';
import { EmptyState } from '../../../components/ui/empty-state';
import { PaperPanel } from '../../../components/ui/surface';
import { buttonClassName } from '../../../components/ui/button-styles';
import { BroadcastNav, BroadcastShell } from '../../../components/ui/broadcast-shell';

export const viewport: Viewport = {
  // sourceRef: docs/UI_DESIGN_SYSTEM.md, broadcast night field --cream.
  themeColor: '#0A130C',
};

/**
 * Time Machine screen: the match screen in replay mode. Sessions are
 * ephemeral (30 min idle cap), so an expired id gets a designed dead end,
 * not a bare 404.
 */
export default async function ReplayPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ sponsor?: string | string[] }>;
}) {
  const { sessionId } = await params;
  const { sponsor } = await searchParams;
  const sessionResult = await fetchReplaySession(sessionId);

  if (!sessionResult.ok) {
    return (
      <BroadcastShell>
        <BroadcastNav />
        <div className="mx-auto mt-14 max-w-[640px]">
          <PaperPanel>
            <div className="p-2">
              <EmptyState
                motif="error"
                title={
                  sessionResult.reason === 'unknown_session'
                    ? 'This replay session expired'
                    : 'The Time Machine did not answer'
                }
                action={
                  <Link href="/" className={buttonClassName('primary')}>
                    Back to the lobby
                  </Link>
                }
              />
            </div>
          </PaperPanel>
        </div>
      </BroadcastShell>
    );
  }

  const [tapes, sponsorBoard] = await Promise.all([fetchReplayTapes(), fetchSponsorBoard()]);
  const tape = tapes.ok
    ? tapes.tapes.find((candidate) => candidate.fixtureId === sessionResult.session.fixtureId)
    : undefined;

  return (
    <BroadcastShell>
      <BroadcastNav />
      {/* Header board: renders only when someone has paid (product rule). */}
      <div className="mt-4">
        <SponsorTicker sponsors={sponsorBoard} />
      </div>
      <MatchScreen
        mode={{
          kind: 'replay',
          sessionId,
          fixtureId: sessionResult.session.fixtureId,
          initialSpeed: sessionResult.session.speed,
        }}
        participant1={tape?.participant1 ?? 'Home side'}
        participant2={tape?.participant2 ?? 'Away side'}
        competition={tape?.competition ?? 'World Cup'}
        startTimeMs={0}
        sponsorName={resolveSponsorName(sponsor)}
      />
    </BroadcastShell>
  );
}
