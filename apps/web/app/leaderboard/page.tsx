import type { Viewport } from 'next';
import Link from 'next/link';
import { fetchLeaderboard } from '../../lib/api';
import { EmptyState } from '../../components/ui/empty-state';
import { Eyebrow } from '../../components/ui/eyebrow';
import { PaperPanel } from '../../components/ui/surface';
import { buttonClassName } from '../../components/ui/button-styles';
import { BroadcastShell, BroadcastTopBar } from '../../components/ui/broadcast-shell';
import { Standings } from '../../components/leaderboard/standings';
import { JoinBoard } from '../../components/leaderboard/join-board';

export const viewport: Viewport = {
  // sourceRef: docs/UI_DESIGN_SYSTEM.md, broadcast night field --cream.
  themeColor: '#0A130C',
};

function TitleBlock() {
  return (
    <div className="mb-6 mt-4">
      <h1 className="bc-title text-4xl font-bold tracking-[-0.02em] text-white">Leaderboard</h1>
      <p className="mt-2.5 text-[15px] text-ink-muted">
        Points from settled calls. Streaks multiply the next hit.
      </p>
    </div>
  );
}

export default async function LeaderboardPage() {
  const result = await fetchLeaderboard();

  return (
    <BroadcastShell>
      <div className="mx-auto w-full max-w-[800px]">
        <BroadcastTopBar eyebrow={<Eyebrow>World Cup standings</Eyebrow>} />
        <TitleBlock />

        <PaperPanel>
          <div className="p-2">
            {!result.ok ? (
              <EmptyState
                motif="error"
                title="Standings did not load"
                action={
                  <Link href="/leaderboard" className={buttonClassName('primary')}>
                    Retry
                  </Link>
                }
              />
            ) : result.entries.length === 0 ? (
              <EmptyState
                motif="flag"
                title="No calls settled worldwide yet"
                action={
                  <Link href="/" className={buttonClassName('primary')}>
                    See live matches
                  </Link>
                }
              />
            ) : (
              <Standings entries={result.entries} />
            )}
          </div>
        </PaperPanel>

        <JoinBoard />
      </div>
    </BroadcastShell>
  );
}
