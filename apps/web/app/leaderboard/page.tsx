import Link from 'next/link';
import { fetchLeaderboard } from '../../lib/api';
import { EmptyState } from '../../components/ui/empty-state';
import { Eyebrow } from '../../components/ui/eyebrow';
import { Tray } from '../../components/ui/surface';
import { buttonClassName } from '../../components/ui/button-styles';
import { Standings } from '../../components/leaderboard/standings';

function TopBar() {
  return (
    <div className="grid grid-cols-[44px_1fr_44px] items-center gap-3 pb-3.5 pt-3">
      <Link
        href="/"
        aria-label="Back to the lobby"
        className="inline-flex size-11 items-center justify-center border border-hairline transition-transform duration-[var(--duration-micro)] ease-[var(--ease-standard)] active:scale-[0.97]"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M10 3L5 8l5 5"
            stroke="var(--ink)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
      <span className="justify-self-center">
        <Eyebrow>World Cup standings</Eyebrow>
      </span>
      <span />
    </div>
  );
}

function TitleBlock() {
  return (
    <div className="mb-6 mt-5">
      <h1 className="text-4xl font-medium tracking-[-0.03em]">Leaderboard</h1>
      <p className="mt-2 text-[15px] text-ink-muted">
        Points from settled calls. Streaks multiply the next hit.
      </p>
    </div>
  );
}

export default async function LeaderboardPage() {
  const result = await fetchLeaderboard();

  return (
    <main className="mx-auto w-full max-w-[760px] px-5 pb-20 sm:px-7.5">
      <TopBar />
      <TitleBlock />

      {!result.ok ? (
        <Tray className="p-2">
          <EmptyState
            motif="error"
            title="Standings did not load"
            action={
              <Link href="/leaderboard" className={buttonClassName('primary')}>
                Retry
              </Link>
            }
          />
        </Tray>
      ) : result.entries.length === 0 ? (
        <Tray className="p-2">
          <EmptyState
            motif="flag"
            title="No calls settled worldwide yet"
            action={
              <Link href="/" className={buttonClassName('primary')}>
                See live matches
              </Link>
            }
          />
        </Tray>
      ) : (
        <Standings entries={result.entries} />
      )}
    </main>
  );
}
