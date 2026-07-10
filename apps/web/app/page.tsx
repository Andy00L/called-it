import Link from 'next/link';
import { fetchFixtures, fetchReplayTapes } from '../lib/api';
import { EmptyState } from '../components/ui/empty-state';
import { Eyebrow } from '../components/ui/eyebrow';
import { Card, Tray } from '../components/ui/surface';
import { buttonClassName } from '../components/ui/button-styles';
import { LiveFixtureRow, UpcomingFixtureRow } from '../components/lobby/fixture-card';
import { ReplayTapeRow } from '../components/lobby/replay-row';

function NavCard() {
  const navLinkClasses =
    'inline-flex min-h-10 items-center justify-center rounded-chip border border-hairline px-4 text-sm font-medium text-ink transition-transform duration-[var(--duration-micro)] ease-[var(--ease-standard)] hover:underline active:scale-[0.97]';
  return (
    <nav
      aria-label="Main"
      className="mt-4 flex items-center justify-between gap-3 rounded-card border border-hairline bg-card px-4 py-2.5 [box-shadow:var(--shadow-float)]"
    >
      <span className="text-[17px] font-semibold tracking-[-0.03em]">CALLED IT</span>
      <div className="flex gap-2">
        <Link href="/leaderboard" className={navLinkClasses}>
          Leaderboard
        </Link>
        <Link href="/profile" className={navLinkClasses}>
          Profile
        </Link>
      </div>
    </nav>
  );
}

function HeroHeader() {
  return (
    <header className="mx-auto mb-14 mt-13 max-w-[760px] text-center">
      <Eyebrow>Free live prediction game</Eyebrow>
      <h1 className="mt-4 text-[clamp(36px,4.6vw,52px)] font-medium leading-[1.08] tracking-[-0.03em]">
        Call the match live.
        <br />
        <span className="text-accent">Prove it on Solana.</span>
      </h1>
      <p className="mt-3.5 text-base text-ink-muted">
        Priced by the market. Settled by the feed. Anchored on-chain.
      </p>
    </header>
  );
}

export default async function LobbyPage() {
  const [fixturesResult, tapesResult] = await Promise.all([fetchFixtures(), fetchReplayTapes()]);

  if (!fixturesResult.ok) {
    return (
      <main className="mx-auto w-full max-w-[1060px] px-5 pb-20 sm:px-7.5">
        <NavCard />
        <HeroHeader />
        <Tray className="p-2">
          <div className="mx-2.5 mb-2 mt-1.5 flex">
            <Eyebrow>Live now</Eyebrow>
          </div>
          <EmptyState
            motif="error"
            title="The feed dropped"
            action={
              <Link href="/" className={buttonClassName('primary')}>
                Retry
              </Link>
            }
          />
        </Tray>
      </main>
    );
  }

  const liveFixtures = fixturesResult.fixtures.filter((fixture) => fixture.phase === 'live');
  const upcomingFixtures = fixturesResult.fixtures.filter((fixture) => fixture.phase === 'pre');
  const tapes = tapesResult.ok ? tapesResult.tapes : [];

  return (
    <main className="mx-auto w-full max-w-[1060px] px-5 pb-20 sm:px-7.5">
      <NavCard />
      <HeroHeader />

      <div className="flex flex-wrap items-start gap-5">
        <section
          aria-label="Live now"
          className="tray min-w-0 flex-[2_1_560px] p-2 [animation:deck-in_var(--duration-standard)_var(--ease-enter)_both]"
        >
          <div className="mx-2.5 mb-2 mt-1.5 flex">
            <Eyebrow>Live now</Eyebrow>
          </div>
          {liveFixtures.length === 0 ? (
            <EmptyState
              motif="ball"
              title="No live match right now"
              action={
                tapes.length > 0 ? (
                  <a href="#replay-them" className={buttonClassName('ghost')}>
                    Replay a finished match
                  </a>
                ) : undefined
              }
            />
          ) : (
            <Card className="overflow-hidden">
              {liveFixtures.map((fixture, index) => (
                <div key={fixture.fixtureId} className={index === 0 ? '' : 'rule-dashed'}>
                  <LiveFixtureRow fixture={fixture} />
                </div>
              ))}
            </Card>
          )}
        </section>

        <section
          aria-label="Up next"
          className="tray min-w-0 flex-[1_1_300px] p-2 [animation:deck-in_var(--duration-standard)_var(--ease-enter)_40ms_both]"
        >
          <div className="mx-2.5 mb-2 mt-1.5 flex">
            <Eyebrow>Up next</Eyebrow>
          </div>
          {upcomingFixtures.length === 0 ? (
            <EmptyState motif="flag" title="No kickoff scheduled in the window" />
          ) : (
            <Card>
              {upcomingFixtures.map((fixture, index) => (
                <div key={fixture.fixtureId} className={index === 0 ? '' : 'rule-dashed'}>
                  <UpcomingFixtureRow fixture={fixture} />
                </div>
              ))}
            </Card>
          )}
        </section>

        {tapes.length > 0 ? (
          <section
            id="replay-them"
            aria-label="Replay them"
            className="tray flex-[1_1_100%] p-2 [animation:deck-in_var(--duration-standard)_var(--ease-enter)_80ms_both]"
          >
            <div className="mx-2.5 mb-2 mt-1.5 flex">
              <Eyebrow>Replay them</Eyebrow>
            </div>
            <Card className="overflow-hidden">
              {tapes.map((tape, index) => (
                <div key={tape.fixtureId} className={index === 0 ? '' : 'rule-dashed'}>
                  <ReplayTapeRow tape={tape} />
                </div>
              ))}
              <div className="rule-dashed px-4 py-3 sm:px-4.5">
                <span className="text-xs text-ink-muted">Play it back at 10x</span>
              </div>
            </Card>
          </section>
        ) : null}
      </div>

      <p className="mt-11 text-center text-xs text-ink-muted">
        runs on TxLINE data, anchored on Solana
      </p>
    </main>
  );
}
