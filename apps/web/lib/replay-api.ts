import type { LockResult, ReplayCreateResult, ReplaySessionInfo } from '@calledit/contracts';
import { workerUrl } from './api';

/**
 * Client for the Time Machine routes. Replay sessions are anonymous (the
 * worker plays them on a hidden per-session guest); no auth headers.
 */

export type ReplayFailure =
  | 'no_tape'
  | 'fixture_still_live'
  | 'replay_capacity'
  | 'unknown_session'
  | 'network'
  | 'server';

const KNOWN_REPLAY_FAILURES: readonly ReplayFailure[] = [
  'no_tape',
  'fixture_still_live',
  'replay_capacity',
  'unknown_session',
];

function isKnownReplayFailure(code: string): code is ReplayFailure {
  return (KNOWN_REPLAY_FAILURES as readonly string[]).includes(code);
}

async function postReplay<Value>(
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: true; value: Value } | { ok: false; reason: ReplayFailure }> {
  let response: Response;
  try {
    response = await fetch(`${workerUrl()}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, reason: 'network' };
  }
  if (response.ok) {
    try {
      return { ok: true, value: (await response.json()) as Value };
    } catch {
      return { ok: false, reason: 'server' };
    }
  }
  try {
    const errorBody = (await response.json()) as { error?: string };
    const code = errorBody.error ?? '';
    if (isKnownReplayFailure(code)) {
      return { ok: false, reason: code };
    }
  } catch {
    // fall through: non-JSON error body maps to the generic reason below
  }
  return { ok: false, reason: 'server' };
}

export type ReplayCreateOutcome =
  | { ok: true; session: ReplaySessionInfo }
  | { ok: false; reason: ReplayFailure };

export async function createReplaySession(
  fixtureId: number,
  speed: number,
): Promise<ReplayCreateOutcome> {
  const created = await postReplay<ReplayCreateResult>('/replay/sessions', { fixtureId, speed });
  return created.ok ? { ok: true, session: created.value.session } : created;
}

export type ReplayLockOutcome =
  | { ok: true; result: LockResult }
  | { ok: false; reason: ReplayFailure | 'lock_refused' };

export async function lockReplayPick(
  sessionId: string,
  optionId: string,
): Promise<ReplayLockOutcome> {
  const locked = await postReplay<LockResult>(`/replay/sessions/${sessionId}/picks`, { optionId });
  if (locked.ok) {
    return { ok: true, result: locked.value };
  }
  // Game-side refusals (duplicate category, window too short) share one
  // player-facing message on replays; network/session failures stay distinct.
  return locked.reason === 'server' ? { ok: false, reason: 'lock_refused' } : locked;
}

export type ReplaySpeedOutcome =
  | { ok: true; session: ReplaySessionInfo }
  | { ok: false; reason: ReplayFailure };

export async function setReplaySpeed(
  sessionId: string,
  speed: number,
): Promise<ReplaySpeedOutcome> {
  const updated = await postReplay<ReplaySessionInfo>(`/replay/sessions/${sessionId}/speed`, {
    speed,
  });
  return updated.ok ? { ok: true, session: updated.value } : updated;
}

/** Server-side fetch of one session's info (the replay page shell). */
export async function fetchReplaySession(
  sessionId: string,
): Promise<{ ok: true; session: ReplaySessionInfo } | { ok: false; reason: ReplayFailure }> {
  let response: Response;
  try {
    response = await fetch(`${workerUrl()}/replay/sessions/${sessionId}`, { cache: 'no-store' });
  } catch {
    return { ok: false, reason: 'network' };
  }
  if (response.status === 404) {
    return { ok: false, reason: 'unknown_session' };
  }
  if (!response.ok) {
    return { ok: false, reason: 'server' };
  }
  try {
    return { ok: true, session: (await response.json()) as ReplaySessionInfo };
  } catch {
    return { ok: false, reason: 'server' };
  }
}

/** Player-facing copy per replay failure (distinct, actionable). */
export const REPLAY_FAILURE_COPY: Record<ReplayFailure | 'lock_refused', string> = {
  no_tape: 'No tape captured for this match yet.',
  fixture_still_live: 'This match is still live. Play it on the live screen.',
  replay_capacity: 'All replay seats are taken right now. Try again in a minute.',
  unknown_session: 'This replay session expired. Start a fresh one from the lobby.',
  network: 'Could not reach the game server. Check your connection and retry.',
  server: 'The game server had a hiccup. Retry in a moment.',
  lock_refused: 'That call cannot be locked right now; the window may have closed.',
};
