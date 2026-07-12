import type { FixtureSummary } from '@calledit/contracts';

/**
 * Team identity and tournament-state derivation, all from what the feed has
 * actually served (fixture summaries). Honesty rules baked in:
 * - a team is OUT only when it provably lost a finished World Cup match;
 * - the wheel number is the team's NEXT-MATCH win probability (there is no
 *   tournament-winner market in the feed, so none is ever shown);
 * - a team with no upcoming fixture yet (its next round is not scheduled)
 *   stays alive with no number.
 */

interface TeamMeta {
  /** Three-letter display code. */
  code: string;
  /** circle-flags file name under public/flags (vendored, MIT). */
  iso: string;
}

// Feed participant names, exactly as served (sourceRef: fixtures/snapshot +
// fixtures-seen). Extend when the feed introduces a new team.
const TEAM_META: Record<string, TeamMeta> = {
  Argentina: { code: 'ARG', iso: 'ar' },
  Switzerland: { code: 'SUI', iso: 'ch' },
  France: { code: 'FRA', iso: 'fr' },
  Spain: { code: 'ESP', iso: 'es' },
  England: { code: 'ENG', iso: 'gb-eng' },
  USA: { code: 'USA', iso: 'us' },
  Bosnia: { code: 'BIH', iso: 'ba' },
  Belgium: { code: 'BEL', iso: 'be' },
  Paraguay: { code: 'PAR', iso: 'py' },
  Norway: { code: 'NOR', iso: 'no' },
  Morocco: { code: 'MAR', iso: 'ma' },
  Vietnam: { code: 'VIE', iso: 'vn' },
  Myanmar: { code: 'MYA', iso: 'mm' },
  Australia: { code: 'AUS', iso: 'au' },
  Brazil: { code: 'BRA', iso: 'br' },
};

export function teamCode(teamName: string): string {
  return TEAM_META[teamName]?.code ?? teamName.slice(0, 3).toUpperCase();
}

/** Vendored flag path, or null when the team has no flag asset yet. */
export function teamFlagSrc(teamName: string): string | null {
  const meta = TEAM_META[teamName];
  return meta === undefined ? null : `/flags/${meta.iso}.svg`;
}

export interface WheelTeam {
  name: string;
  code: string;
  flagSrc: string | null;
  status: 'alive' | 'out';
  /** Next-match win probability in whole percent; null when not published. */
  nextMatchWinPct: number | null;
}

// Longest match footprint from kickoff (regulation + ET + shootout), mirrors
// the lobby page's still-to-be-played rule.
const MATCH_MAX_DURATION_MS = 4 * 60 * 60 * 1000;

/**
 * Reduce the fixture list to the tournament wheel: every World Cup team the
 * feed has served, eliminated ones marked OUT, alive ones carrying their
 * next-match win probability when the market is open.
 *
 * Alive is derived from the SCHEDULE, not from live match state: a worker
 * restart resets finished fixtures to a stale 'pre' with no score, so "still
 * scheduled to play" (or "won its latest finished match with a known score")
 * is the signal that survives restarts. At the knockout stage this is exact:
 * a team with no future fixture and no known win is out of the tournament.
 */
export function buildWheelTeams(fixtures: FixtureSummary[], nowMs: number): WheelTeam[] {
  const worldCup = fixtures.filter((fixture) => fixture.competition === 'World Cup');
  const pctByTeam = new Map<string, number>();
  const orderedNames: string[] = [];
  const seen = new Set<string>();
  const alive = new Set<string>();
  /** Latest finished fixture with a known score, per team (winner bridge). */
  const latestKnownResult = new Map<string, { startTimeMs: number; won: boolean }>();

  for (const fixture of worldCup) {
    for (const name of [fixture.participant1, fixture.participant2]) {
      if (name !== '' && !seen.has(name)) {
        seen.add(name);
        orderedNames.push(name);
      }
    }
    const isStillToBePlayed = fixture.startTimeMs + MATCH_MAX_DURATION_MS > nowMs;
    if (isStillToBePlayed && fixture.phase !== 'finished') {
      alive.add(fixture.participant1);
      alive.add(fixture.participant2);
      continue;
    }
    // A decided score is only trusted while the worker still holds the match
    // state; it bridges winners between rounds before the next draw appears.
    if (fixture.phase === 'finished' && fixture.goalsP1 !== fixture.goalsP2) {
      const winner = fixture.goalsP1 > fixture.goalsP2 ? fixture.participant1 : fixture.participant2;
      const loser = fixture.goalsP1 > fixture.goalsP2 ? fixture.participant2 : fixture.participant1;
      for (const [name, won] of [
        [winner, true],
        [loser, false],
      ] as const) {
        const known = latestKnownResult.get(name);
        if (known === undefined || fixture.startTimeMs > known.startTimeMs) {
          latestKnownResult.set(name, { startTimeMs: fixture.startTimeMs, won });
        }
      }
    }
  }
  for (const [name, result] of latestKnownResult) {
    if (result.won) {
      alive.add(name);
    }
  }

  const upcoming = worldCup
    .filter(
      (fixture) =>
        fixture.phase !== 'finished' && fixture.startTimeMs + MATCH_MAX_DURATION_MS > nowMs,
    )
    .sort((first, second) => first.startTimeMs - second.startTimeMs);
  for (const fixture of upcoming) {
    if (fixture.matchResult !== null) {
      if (!pctByTeam.has(fixture.participant1)) {
        pctByTeam.set(fixture.participant1, Math.round(fixture.matchResult.p1 * 100));
      }
      if (!pctByTeam.has(fixture.participant2)) {
        pctByTeam.set(fixture.participant2, Math.round(fixture.matchResult.p2 * 100));
      }
    }
  }

  return orderedNames.map((name) => ({
    name,
    code: teamCode(name),
    flagSrc: teamFlagSrc(name),
    status: alive.has(name) ? 'alive' : 'out',
    nextMatchWinPct: alive.has(name) ? (pctByTeam.get(name) ?? null) : null,
  }));
}
