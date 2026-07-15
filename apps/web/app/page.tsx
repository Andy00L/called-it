import type { Viewport } from 'next';
import Link from 'next/link';
import { fetchDuelStats, fetchFixtures, fetchReplayTapes } from '../lib/api';
import { fetchSponsorBoard } from '../lib/sponsor-api';
import { buildWheelTeams, type WheelTeam } from '../lib/teams';
import { EmptyState } from '../components/ui/empty-state';
import { Eyebrow } from '../components/ui/eyebrow';
import { Tray } from '../components/ui/surface';
import {
  BROADCAST_NAV_LINK_CLASSES,
  BroadcastNav,
  BroadcastShell,
} from '../components/ui/broadcast-shell';
import { StadiumBowl } from '../components/lobby/stadium-bowl';
import { GoldTrophy } from '../components/lobby/gold-trophy';
import { ProgrammeRail, type RailEntry } from '../components/lobby/programme-rail';
import { DuelLine } from '../components/lobby/duel-line';
import { SponsorTicker } from '../components/lobby/sponsor-ticker';
import { HowItWorks } from '../components/onboarding/how-it-works';

export const viewport: Viewport = {
  // sourceRef: docs/UI_DESIGN_SYSTEM.md, broadcast night field --cream.
  themeColor: '#0A130C',
};

function HeroText() {
  return (
    <>
      <Eyebrow>Free live prediction game</Eyebrow>
      <h1 className="bc-title mt-5 text-[clamp(38px,6vw,78px)] font-bold leading-[1.06] tracking-[-0.02em] text-white">
        Call the match live.
        <br />
        <span className="bc-blue-glow text-[var(--bc-blue)]">Prove it on Solana.</span>
      </h1>
      <p className="bc-title mt-5 text-[clamp(16px,1.6vw,20px)] text-ink-muted">
        Priced by the market. Settled by the feed. Anchored on-chain.
      </p>
    </>
  );
}

/** Alive counter over the bowl; renders only when the feed served teams. */
function TeamsCounter({ teams }: { teams: WheelTeam[] }) {
  if (teams.length === 0) {
    return null;
  }
  const aliveCount = teams.filter((team) => team.status === 'alive').length;
  return (
    <div className="mt-3 flex justify-end">
      <span className="tabular font-mono text-xs tracking-[0.08em] text-ink-faint">
        {teams.length} teams &middot; {aliveCount} alive
      </span>
    </div>
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
      <BroadcastShell>
        <BroadcastNav />
        <header className="mx-auto mb-14 mt-16 max-w-[760px] text-center">
          <HeroText />
        </header>
        <Tray className="p-2">
          <div className="mx-2.5 mb-2 mt-1.5 flex">
            <Eyebrow>Live now</Eyebrow>
          </div>
          <EmptyState
            motif="error"
            title="The feed dropped"
            action={
              <Link href="/" className={BROADCAST_NAV_LINK_CLASSES}>
                Retry
              </Link>
            }
          />
        </Tray>
      </BroadcastShell>
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

  const wheelTeams = buildWheelTeams(fixturesResult.fixtures, nowMs);

  return (
    <BroadcastShell>
      <BroadcastNav />
      {/* Header board: renders only when someone has paid (product rule). */}
      <div className="mt-4">
        <SponsorTicker sponsors={sponsorBoard} />
      </div>
      <TeamsCounter teams={wheelTeams} />
      {/* The hero rides inside the stadium bowl: the bowl is the backdrop
          behind the title, the trophy is the one gold ornament, the duel
          line closes the block. */}
      <section className="relative mx-auto -mt-1.5 mb-12">
        <StadiumBowl teams={wheelTeams} />
        <div className="relative z-[4] mx-auto max-w-[860px] px-5 pt-[104px] text-center sm:pt-[140px] lg:pt-[158px]">
          <HeroText />
          <div className="relative mt-8 flex flex-col items-center">
            <div aria-hidden className="trophy-plinth absolute -bottom-1.5 h-16 w-[264px]" />
            <GoldTrophy width={86} />
          </div>
          <DuelLine stats={duelStats} className="mt-7" />
        </div>
      </section>

      <HowItWorks className="mb-6" />

      {railEntries.length === 0 ? (
        <div className="mt-10">
          <div className="mx-0.5 mb-3 flex">
            <Eyebrow>The programme</Eyebrow>
          </div>
          <div className="gilt-frame">
            <div className="bc-pitch p-2">
              <EmptyState motif="ball" title="No matches in the window yet" />
            </div>
          </div>
        </div>
      ) : (
        <ProgrammeRail entries={railEntries} />
      )}

      <p className="tabular mt-12 text-center font-mono text-xs text-ink-faint">
        runs on TxLINE data, anchored on Solana <span aria-hidden>&middot;</span>{' '}
        <Link
          href="/sponsor"
          className="text-accent underline decoration-[var(--accent-line)] underline-offset-[3px] hover:text-accent-deep"
        >
          sponsor the board
        </Link>
      </p>
    </BroadcastShell>
  );
}
