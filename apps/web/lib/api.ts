import type { FixtureSummary, LeaderboardEntry } from '@calledit/contracts';

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

export type FixturesResult =
  | { ok: true; fixtures: FixtureSummary[] }
  | { ok: false; reason: 'unreachable' | 'bad_status' | 'bad_payload' };

export type LeaderboardResult =
  | { ok: true; entries: LeaderboardEntry[] }
  | { ok: false; reason: 'unreachable' | 'bad_status' | 'bad_payload' };

/** Server-side leaderboard fetch; always fresh. */
export async function fetchLeaderboard(): Promise<LeaderboardResult> {
  let response: Response;
  try {
    response = await fetch(`${workerUrl()}/leaderboard`, { cache: 'no-store' });
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
  if (!response.ok) {
    return { ok: false, reason: 'bad_status' };
  }
  try {
    const payload = (await response.json()) as LeaderboardEntry[];
    if (!Array.isArray(payload)) {
      return { ok: false, reason: 'bad_payload' };
    }
    return { ok: true, entries: payload };
  } catch {
    return { ok: false, reason: 'bad_payload' };
  }
}

/** Server-side lobby fetch; always fresh (live scores go stale in seconds). */
export async function fetchFixtures(): Promise<FixturesResult> {
  let response: Response;
  try {
    response = await fetch(`${workerUrl()}/fixtures`, { cache: 'no-store' });
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
  if (!response.ok) {
    return { ok: false, reason: 'bad_status' };
  }
  try {
    const payload = (await response.json()) as FixtureSummary[];
    if (!Array.isArray(payload)) {
      return { ok: false, reason: 'bad_payload' };
    }
    return { ok: true, fixtures: payload };
  } catch {
    return { ok: false, reason: 'bad_payload' };
  }
}
