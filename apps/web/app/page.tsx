import Link from 'next/link';
import { fetchDuelStats, fetchFixtures, fetchReplayTapes } from '../lib/api';
import { fetchSponsorBoard } from '../lib/sponsor-api';
import { buildWheelTeams } from '../lib/teams';
import { EmptyState } from '../components/ui/empty-state';
import { Eyebrow } from '../components/ui/eyebrow';
import { Tray } from '../components/ui/surface';
import { buttonClassName } from '../components/ui/button-styles';
import { TournamentWheelBackdrop } from '../components/lobby/tournament-wheel';
import { ProgrammeRail, type RailEntry } from '../components/lobby/programme-rail';
import { DuelLine } from '../components/lobby/duel-line';
import { SponsorTicker } from '../components/lobby/sponsor-ticker';
import { HowItWorks } from '../components/onboarding/how-it-works';

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

function HeroText() {
  return (
    <>
      <Eyebrow>Free live prediction game</Eyebrow>
      <h1 className="mt-4 text-[clamp(36px,4.6vw,52px)] font-medium leading-[1.08] tracking-[-0.03em]">
        Call the match live.
        <br />
        <span className="text-accent">Prove it on Solana.</span>
      </h1>
      <p className="mt-3.5 text-base text-ink-muted">
        Priced by the market. Settled by the feed. Anchored on-chain.
      </p>
    </>
  );
}

/** Plain hero, no wheel: the feed-down error branch where no teams exist. */
function HeroHeader() {
  return (
    <header className="mx-auto mb-14 mt-13 max-w-[760px] text-center">
      <HeroText />
    </header>
  );
}

export default async function LobbyPage() {
  const [fixturesResult, tapesResult, duelResult, sponsorBoard] = await Promise.all([
    fetchFixtures(),
    fetchReplayTapes(),
    fetchDuelStats(),
    fetchSponsorBoard(),
  ]);
  const duelStats = duelResult.ok ? duelResult.stats : null;

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

  // Longest match footprint from kickoff: regulation, stoppage, extra time,
  // and a shootout fit comfortably inside four hours.
  const MATCH_MAX_DURATION_MS = 4 * 60 * 60 * 1000;
  const nowMs = Date.now();
  // The fixtures list can carry a stale 'pre' phase: a worker restart resets
  // in-memory match state while the catalog still remembers the fixture. So
  // "still to be played" is judged by phase AND the clock, and rows sort by
  // kickoff so the programme reads top to bottom.
  const isStillToBePlayed = (phase: string, startTimeMs: number): boolean =>
    phase !== 'finished' && startTimeMs + MATCH_MAX_DURATION_MS > nowMs;
  // The programme covers the coming fortnight; a friendly ten weeks out is
  // catalog noise, not an edition on the shelf.
  const RAIL_UPCOMING_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
  const liveFixtures = fixturesResult.fixtures.filter((fixture) => fixture.phase === 'live');
  const upcomingFixtures = fixturesResult.fixtures
    .filter(
      (fixture) =>
        fixture.phase === 'pre' &&
        isStillToBePlayed(fixture.phase, fixture.startTimeMs) &&
        fixture.startTimeMs < nowMs + RAIL_UPCOMING_WINDOW_MS,
    )
    .sort((first, second) => first.startTimeMs - second.startTimeMs);
  // Tapes captured before the durable name cache shipped have no team names
  // (the worker falls back to "Fixture N" with an empty participant2), and a
  // pre-match fixture grows an odds-only tape before kickoff; the lobby
  // shows only named, actually finished replays so the shelf reads like a
  // programme.
  const notFinishedIds = new Set(
    fixturesResult.fixtures
      .filter((fixture) => isStillToBePlayed(fixture.phase, fixture.startTimeMs))
      .map((fixture) => fixture.fixtureId),
  );
  const tapes = tapesResult.ok
    ? tapesResult.tapes.filter(
        (tape) => tape.participant2 !== '' && !notFinishedIds.has(tape.fixtureId),
      )
    : [];

  // The rail reads left to right as the programme does: finished editions
  // (oldest first), then the live edition popped off the shelf, then the
  // upcoming ones counting down. Final scores come from the live state when
  // the worker still holds it; a tape alone never invents one.
  const fixtureById = new Map(fixturesResult.fixtures.map((fixture) => [fixture.fixtureId, fixture]));
  const railEntries: RailEntry[] = [
    ...[...tapes]
      .sort((first, second) => first.updatedAtMs - second.updatedAtMs)
      .map((tape) => {
        const state = fixtureById.get(tape.fixtureId);
        const liveScore =
          state !== undefined && state.phase === 'finished'
            ? { p1: state.goalsP1, p2: state.goalsP2 }
            : null;
        // A worker restart wipes live state; the tape's own tail still knows.
        const tapeScore =
          tape.finalGoalsP1 !== null && tape.finalGoalsP2 !== null
            ? { p1: tape.finalGoalsP1, p2: tape.finalGoalsP2 }
            : null;
        return {
          kind: 'replay' as const,
          fixtureId: tape.fixtureId,
          participant1: tape.participant1,
          participant2: tape.participant2,
          competition: tape.competition,
          score: liveScore ?? tapeScore,
        };
      }),
    ...liveFixtures.map((fixture) => ({
      kind: 'live' as const,
      fixtureId: fixture.fixtureId,
      participant1: fixture.participant1,
      participant2: fixture.participant2,
      goalsP1: fixture.goalsP1,
      goalsP2: fixture.goalsP2,
      clockSeconds: fixture.clockSeconds,
      matchResult: fixture.matchResult,
    })),
    ...upcomingFixtures.map((fixture) => ({
      kind: 'upcoming' as const,
      fixtureId: fixture.fixtureId,
      participant1: fixture.participant1,
      participant2: fixture.participant2,
      competition: fixture.competition,
      startTimeMs: fixture.startTimeMs,
      matchResult: fixture.matchResult,
    })),
  ];

  return (
    <main className="mx-auto w-full max-w-[1060px] px-5 pb-20 sm:px-7.5">
      <NavCard />
      {/* Header board: renders only when someone has paid (product rule). */}
      <div className="mt-4">
        <SponsorTicker sponsors={sponsorBoard} />
      </div>
      {/* The hero rides over the ambient tournament wheel: the wheel is the
          backdrop behind the title, its own text block is gone, the duel
          line closes the block. */}
      <section className="relative mx-auto mb-12 mt-2 max-w-[900px]">
        <TournamentWheelBackdrop teams={buildWheelTeams(fixturesResult.fixtures, nowMs)} />
        <div className="relative z-[1] mx-auto max-w-[720px] px-5 pb-1 pt-[132px] text-center">
          <HeroText />
          <DuelLine stats={duelStats} className="mt-6" />
        </div>
      </section>

      <HowItWorks className="mb-5" />

      {railEntries.length === 0 ? (
        <Tray className="mt-7 p-2">
          <div className="mx-2.5 mb-2 mt-1.5 flex">
            <Eyebrow>The programme</Eyebrow>
          </div>
          <EmptyState motif="ball" title="No matches in the window yet" />
        </Tray>
      ) : (
        <ProgrammeRail entries={railEntries} />
      )}

      <p className="mt-11 text-center text-xs text-ink-muted">
        runs on TxLINE data, anchored on Solana{' '}
        <span aria-hidden>&middot;</span>{' '}
        <Link href="/sponsor" className="underline decoration-hairline underline-offset-2">
          sponsor the board
        </Link>
      </p>
    </main>
  );
}
