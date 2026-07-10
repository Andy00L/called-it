import type {
  FixtureLeaderboardEntry,
  FixtureSummary,
  LeaderboardEntry,
  ReceiptPayload,
  ReplayTapeSummary,
} from '@calledit/contracts';

/**
 * Worker API access. The worker URL is public configuration (the API is
 * CORS-open and unauthenticated for reads); NEXT_PUBLIC_ makes it available
 * to the browser for the SSE channel as well.
 */

// sourceRef: deployed worker, see README "Live and measured".
const DEFAULT_WORKER_URL = 'https://worker-production-6555.up.railway.app';

export function workerUrl(): string {
  const configured = process.env['NEXT_PUBLIC_WORKER_URL'];
  return configured !== undefined && configured !== '' ? configured : DEFAULT_WORKER_URL;
}

export type ListFailure = 'unreachable' | 'bad_status' | 'bad_payload';

export type FixturesResult =
  | { ok: true; fixtures: FixtureSummary[] }
  | { ok: false; reason: ListFailure };

export type LeaderboardResult =
  | { ok: true; entries: LeaderboardEntry[] }
  | { ok: false; reason: ListFailure };

export type FixtureLeaderboardResult =
  | { ok: true; entries: FixtureLeaderboardEntry[] }
  | { ok: false; reason: ListFailure };

export type ReplayTapesResult =
  | { ok: true; tapes: ReplayTapeSummary[] }
  | { ok: false; reason: ListFailure };

/** Shared list-endpoint fetch: distinct failure per mode, array payloads only. */
async function fetchJsonArray<Row>(
  path: string,
): Promise<{ ok: true; rows: Row[] } | { ok: false; reason: ListFailure }> {
  let response: Response;
  try {
    response = await fetch(`${workerUrl()}${path}`, { cache: 'no-store' });
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
  if (!response.ok) {
    return { ok: false, reason: 'bad_status' };
  }
  try {
    const payload = (await response.json()) as Row[];
    if (!Array.isArray(payload)) {
      return { ok: false, reason: 'bad_payload' };
    }
    return { ok: true, rows: payload };
  } catch {
    return { ok: false, reason: 'bad_payload' };
  }
}

/** Server-side leaderboard fetch; always fresh. */
export async function fetchLeaderboard(): Promise<LeaderboardResult> {
  const result = await fetchJsonArray<LeaderboardEntry>('/leaderboard');
  return result.ok ? { ok: true, entries: result.rows } : result;
}

/** Per-fixture standings (the match screen's "This match" board). */
export async function fetchFixtureLeaderboard(
  fixtureId: number,
): Promise<FixtureLeaderboardResult> {
  const result = await fetchJsonArray<FixtureLeaderboardEntry>(`/leaderboard/${fixtureId}`);
  return result.ok ? { ok: true, entries: result.rows } : result;
}

/** Server-side lobby fetch; always fresh (live scores go stale in seconds). */
export async function fetchFixtures(): Promise<FixturesResult> {
  const result = await fetchJsonArray<FixtureSummary>('/fixtures');
  return result.ok ? { ok: true, fixtures: result.rows } : result;
}

/** Finished matches with a captured tape, replayable in the Time Machine. */
export async function fetchReplayTapes(): Promise<ReplayTapesResult> {
  const result = await fetchJsonArray<ReplayTapeSummary>('/replay/tapes');
  return result.ok ? { ok: true, tapes: result.rows } : result;
}

/** Pick ids are UUIDs; cheap shape check before hitting the worker. */
export function isPickIdShaped(pickId: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(pickId);
}

export type ReceiptFetchResult =
  | { ok: true; receipt: ReceiptPayload }
  | { ok: false; reason: 'not_found' | ListFailure };

/**
 * Public receipt fetch, shared by the receipt page, its generateMetadata,
 * and the OG image route. React memoizes identical fetches within one
 * render pass, so the page and its metadata cost a single worker call.
 */
export async function fetchReceipt(pickId: string): Promise<ReceiptFetchResult> {
  let response: Response;
  try {
    response = await fetch(`${workerUrl()}/receipts/${pickId}`, { cache: 'no-store' });
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
  if (response.status === 404) {
    return { ok: false, reason: 'not_found' };
  }
  if (!response.ok) {
    return { ok: false, reason: 'bad_status' };
  }
  try {
    return { ok: true, receipt: (await response.json()) as ReceiptPayload };
  } catch {
    return { ok: false, reason: 'bad_payload' };
  }
}
