import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import {
  fetchFixturesSnapshot,
  type Fixture,
  type TxlineNetworkConfig,
} from '@calledit/txline';
import { readStat } from '@calledit/engine';
import type { FixtureSummary } from '@calledit/contracts';
import { refreshGuestJwt, type SharedAuth } from './ingest.js';
import type { MatchState } from './state.js';

/**
 * Fixture metadata cache (team names, kickoff times, competition) behind the
 * lobby's GET /fixtures. The streams only carry fixture ids; names come from
 * the fixtures snapshot, refreshed on a slow cadence because kickoffs and
 * names change rarely inside the 30 day snapshot window.
 *
 * The snapshot window is FUTURE-ONLY (verified on mainnet 2026-07-09), so a
 * restart would lose the names of every finished match, and receipts are read
 * weeks later by judges. Every fixture ever seen is therefore appended to an
 * NDJSON file (same crash-tolerant format as tapes) and restored at boot.
 */

// Slow refresh: the snapshot is a 30 day window; a new match day appears at
// most once per day, and a failed refresh keeps serving the previous cache.
const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

export interface FixtureCatalog {
  listFixtures(): Fixture[];
  refresh(): Promise<void>;
  start(): void;
  stop(): void;
}

export function createFixtureCatalog(
  cfg: TxlineNetworkConfig,
  shared: SharedAuth,
  /** Optional NDJSON path persisting every fixture ever seen. */
  seenFilePath?: string,
): FixtureCatalog {
  const fixturesById = new Map<number, Fixture>();
  const persistedFixtureIds = new Set<number>();
  let refreshTimer: NodeJS.Timeout | null = null;

  if (seenFilePath !== undefined && existsSync(seenFilePath)) {
    let restoredCount = 0;
    for (const line of readFileSync(seenFilePath, 'utf8').split('\n')) {
      if (line === '') {
        continue;
      }
      try {
        const fixture = JSON.parse(line) as Fixture;
        if (typeof fixture.FixtureId === 'number') {
          fixturesById.set(fixture.FixtureId, fixture);
          persistedFixtureIds.add(fixture.FixtureId);
          restoredCount += 1;
        }
      } catch {
        // Torn line after a crash: skip it, the fixture reappears on refresh
        // if it is still in the window.
      }
    }
    console.log(`[createFixtureCatalog] restored ${restoredCount} fixtures from ${seenFilePath}`);
  }

  // Names and kickoffs of an already-persisted fixture rarely change; only
  // new fixture ids are appended (append-only keeps the file crash-safe).
  const persistNewFixtures = (): void => {
    if (seenFilePath === undefined) {
      return;
    }
    try {
      let appendedCount = 0;
      for (const [fixtureId, fixture] of fixturesById) {
        if (persistedFixtureIds.has(fixtureId)) {
          continue;
        }
        appendFileSync(seenFilePath, `${JSON.stringify(fixture)}\n`);
        persistedFixtureIds.add(fixtureId);
        appendedCount += 1;
      }
      if (appendedCount > 0) {
        console.log(`[persistNewFixtures] appended ${appendedCount} fixtures to ${seenFilePath}`);
      }
    } catch (cause) {
      const messageText = cause instanceof Error ? cause.message : String(cause);
      console.error(`[persistNewFixtures] ${messageText}`);
    }
  };

  const refresh = async (): Promise<void> => {
    const auth = { jwt: shared.current.jwt, apiToken: shared.current.apiToken };
    let snapshot = await fetchFixturesSnapshot(cfg, auth);
    if (!snapshot.ok && snapshot.error.code === 'auth_expired') {
      const refreshed = await refreshGuestJwt(cfg, shared);
      if (refreshed) {
        snapshot = await fetchFixturesSnapshot(cfg, {
          jwt: shared.current.jwt,
          apiToken: shared.current.apiToken,
        });
      }
    }
    if (!snapshot.ok) {
      // Keep the previous cache: an empty lobby is worse than a stale one.
      console.error(`[refreshFixtureCatalog] ${snapshot.error.message}`);
      return;
    }
    for (const fixture of snapshot.value) {
      fixturesById.set(fixture.FixtureId, fixture);
    }
    persistNewFixtures();
    console.log(`[refreshFixtureCatalog] catalog holds ${fixturesById.size} fixtures`);
  };

  const start = (): void => {
    if (refreshTimer !== null) {
      return;
    }
    refreshTimer = setInterval(() => {
      void refresh();
    }, REFRESH_INTERVAL_MS);
  };

  const stop = (): void => {
    if (refreshTimer !== null) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  };

  return {
    listFixtures: () => [...fixturesById.values()],
    refresh,
    start,
    stop,
  };
}

function buildSummary(fixture: Fixture | undefined, state: MatchState | undefined): FixtureSummary {
  const fixtureId = fixture?.FixtureId ?? state?.fixtureId ?? 0;
  return {
    fixtureId,
    competition: fixture?.Competition ?? 'Unknown competition',
    participant1: fixture?.Participant1 ?? `Fixture ${fixtureId}`,
    participant2: fixture?.Participant2 ?? '',
    startTimeMs: fixture?.StartTime ?? 0,
    phase: state?.phase ?? 'pre',
    clockSeconds: state?.clockSeconds ?? 0,
    goalsP1: readStat(state?.score, 'goals', 'p1'),
    goalsP2: readStat(state?.score, 'goals', 'p2'),
    matchResult: state?.matchResult ?? null,
    updatedAtMs: state?.updatedAtMs ?? 0,
  };
}

/**
 * Pure merge of fixture metadata with live states: one row per fixture known
 * to either side. Rows sort by kickoff time; rows with no known kickoff
 * (stream data outside the snapshot window) go last.
 */
export function summarizeFixtures(
  fixtures: readonly Fixture[],
  states: readonly MatchState[],
): FixtureSummary[] {
  const stateByFixtureId = new Map(states.map((state) => [state.fixtureId, state]));
  const summaries: FixtureSummary[] = [];
  const coveredFixtureIds = new Set<number>();

  for (const fixture of fixtures) {
    coveredFixtureIds.add(fixture.FixtureId);
    summaries.push(buildSummary(fixture, stateByFixtureId.get(fixture.FixtureId)));
  }
  for (const state of states) {
    if (!coveredFixtureIds.has(state.fixtureId)) {
      summaries.push(buildSummary(undefined, state));
    }
  }

  summaries.sort((left, right) => {
    if (left.startTimeMs === 0 && right.startTimeMs === 0) {
      return left.fixtureId - right.fixtureId;
    }
    if (left.startTimeMs === 0) {
      return 1;
    }
    if (right.startTimeMs === 0) {
      return -1;
    }
    return left.startTimeMs - right.startTimeMs;
  });
  return summaries;
}
