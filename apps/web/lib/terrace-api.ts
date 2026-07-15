import type { GuestSession, TerraceStandingsPayload } from '@calledit/contracts';
import { workerUrl } from './api';

/** Client for the terrace routes. Every failure mode is distinct and typed. */

export type TerraceFailure =
  | 'auth_failed'
  | 'unknown_terrace'
  | 'terrace_full'
  | 'unknown_fixture'
  | 'invalid_terrace_code'
  | 'network'
  | 'server';

export type TerraceOutcome =
  | { ok: true; standings: TerraceStandingsPayload }
  | { ok: false; reason: TerraceFailure };

const KNOWN_TERRACE_FAILURES: readonly TerraceFailure[] = [
  'auth_failed',
  'unknown_terrace',
  'terrace_full',
  'unknown_fixture',
  'invalid_terrace_code',
];

function isKnownTerraceFailure(code: string): code is TerraceFailure {
  return (KNOWN_TERRACE_FAILURES as readonly string[]).includes(code);
}

/** Shared response handling: payload on 2xx, a typed reason otherwise. */
async function parseTerraceResponse(response: Response): Promise<TerraceOutcome> {
  if (response.ok) {
    try {
      return { ok: true, standings: (await response.json()) as TerraceStandingsPayload };
    } catch {
      return { ok: false, reason: 'server' };
    }
  }
  try {
    const body = (await response.json()) as { error?: string };
    const code = body.error ?? '';
    if (isKnownTerraceFailure(code)) {
      return { ok: false, reason: code };
    }
    // sourceRef: apps/worker/src/game.ts terrace error strings.
    if (code.startsWith('invalid_terrace_code')) {
      return { ok: false, reason: 'invalid_terrace_code' };
    }
  } catch {
    // fall through: non-JSON error body maps to the generic reason below
  }
  return { ok: false, reason: 'server' };
}

/** POST /terraces: open a room for a fixture; the creator is seated. */
export async function createTerrace(
  session: GuestSession,
  fixtureId: number,
): Promise<TerraceOutcome> {
  let response: Response;
  try {
    response = await fetch(`${workerUrl()}/terraces`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-player-id': session.playerId,
        'x-player-token': session.playerToken,
      },
      body: JSON.stringify({ fixtureId }),
    });
  } catch {
    return { ok: false, reason: 'network' };
  }
  return parseTerraceResponse(response);
}

/** POST /terraces/:code/join: take a seat (idempotent for members). */
export async function joinTerrace(session: GuestSession, code: string): Promise<TerraceOutcome> {
  let response: Response;
  try {
    response = await fetch(`${workerUrl()}/terraces/${encodeURIComponent(code)}/join`, {
      method: 'POST',
      headers: {
        'x-player-id': session.playerId,
        'x-player-token': session.playerToken,
      },
    });
  } catch {
    return { ok: false, reason: 'network' };
  }
  return parseTerraceResponse(response);
}

/** GET /terraces/:code: the public board read (no auth). */
export async function fetchTerraceStandings(code: string): Promise<TerraceOutcome> {
  let response: Response;
  try {
    response = await fetch(`${workerUrl()}/terraces/${encodeURIComponent(code)}`, {
      cache: 'no-store',
    });
  } catch {
    return { ok: false, reason: 'network' };
  }
  return parseTerraceResponse(response);
}

/** Player-facing copy per failure mode (distinct, actionable). */
export const TERRACE_FAILURE_COPY: Record<TerraceFailure, string> = {
  auth_failed: 'Session expired. Retry to start a fresh identity.',
  unknown_terrace: 'That terrace does not exist. Check the invite link.',
  terrace_full: 'This terrace is full (40 seats).',
  unknown_fixture: 'That match is not on the programme.',
  invalid_terrace_code: 'A terrace code is 6 letters and numbers.',
  network: 'Could not reach the game server. Check your connection and retry.',
  server: 'The game server had a hiccup. Retry in a moment.',
};
