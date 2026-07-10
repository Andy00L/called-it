import type { GuestSession, LockResult, ProfilePayload } from '@calledit/contracts';
import { workerUrl } from './api';

/** Client for the game routes. Every failure mode is distinct and typed. */

export type LockFailure =
  | 'auth_failed'
  | 'duplicate_category'
  | 'window_too_short'
  | 'not_in_running'
  | 'unknown_option'
  | 'unknown_fixture'
  | 'network'
  | 'server';

export type LockOutcome =
  | { ok: true; result: LockResult }
  | { ok: false; reason: LockFailure };

const KNOWN_LOCK_FAILURES: readonly LockFailure[] = [
  'auth_failed',
  'duplicate_category',
  'window_too_short',
  'not_in_running',
  'unknown_option',
  'unknown_fixture',
];

function isKnownLockFailure(code: string): code is LockFailure {
  return (KNOWN_LOCK_FAILURES as readonly string[]).includes(code);
}

export async function lockPick(
  session: GuestSession,
  fixtureId: number,
  optionId: string,
): Promise<LockOutcome> {
  let response: Response;
  try {
    response = await fetch(`${workerUrl()}/picks`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-player-id': session.playerId,
        'x-player-token': session.playerToken,
      },
      body: JSON.stringify({ fixtureId, optionId }),
    });
  } catch {
    return { ok: false, reason: 'network' };
  }

  if (response.ok) {
    try {
      return { ok: true, result: (await response.json()) as LockResult };
    } catch {
      return { ok: false, reason: 'server' };
    }
  }

  try {
    const body = (await response.json()) as { error?: string };
    const code = body.error ?? '';
    if (isKnownLockFailure(code)) {
      return { ok: false, reason: code };
    }
  } catch {
    // fall through: non-JSON error body maps to the generic reason below
  }
  return { ok: false, reason: 'server' };
}

export type RenameFailure = 'auth_failed' | 'invalid_handle' | 'reserved_handle' | 'network' | 'server';

export type RenameOutcome =
  | { ok: true; handle: string }
  | { ok: false; reason: RenameFailure };

/** POST /players/handle: rename the stored guest. Reserved names refused. */
export async function renameHandle(session: GuestSession, handle: string): Promise<RenameOutcome> {
  let response: Response;
  try {
    response = await fetch(`${workerUrl()}/players/handle`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-player-id': session.playerId,
        'x-player-token': session.playerToken,
      },
      body: JSON.stringify({ handle }),
    });
  } catch {
    return { ok: false, reason: 'network' };
  }
  if (response.ok) {
    try {
      const renamed = (await response.json()) as { handle: string };
      return { ok: true, handle: renamed.handle };
    } catch {
      return { ok: false, reason: 'server' };
    }
  }
  try {
    const body = (await response.json()) as { error?: string };
    const code = body.error ?? '';
    if (code === 'auth_failed') {
      return { ok: false, reason: 'auth_failed' };
    }
    // sourceRef: apps/worker/src/game.ts renameHandle error strings.
    if (code.startsWith('invalid_handle: reserved')) {
      return { ok: false, reason: 'reserved_handle' };
    }
    if (code.startsWith('invalid_handle')) {
      return { ok: false, reason: 'invalid_handle' };
    }
  } catch {
    // fall through: non-JSON error body maps to the generic reason below
  }
  return { ok: false, reason: 'server' };
}

/** Player-facing copy per rename failure (distinct, actionable). */
export const RENAME_FAILURE_COPY: Record<RenameFailure, string> = {
  auth_failed: 'Session expired. Lock a call to start a fresh identity, then rename.',
  invalid_handle: '2 to 24 letters, numbers, spaces, _ . -',
  reserved_handle: 'That name is reserved',
  network: 'Could not reach the game server. Check your connection and retry.',
  server: 'The game server had a hiccup. Retry in a moment.',
};

export type ProfileOutcome =
  | { ok: true; profile: ProfilePayload }
  | { ok: false; reason: 'unknown_player' | 'network' | 'server' };

export async function getProfile(playerId: string): Promise<ProfileOutcome> {
  let response: Response;
  try {
    response = await fetch(`${workerUrl()}/profile/${playerId}`, { cache: 'no-store' });
  } catch {
    return { ok: false, reason: 'network' };
  }
  if (response.status === 404) {
    return { ok: false, reason: 'unknown_player' };
  }
  if (!response.ok) {
    return { ok: false, reason: 'server' };
  }
  try {
    return { ok: true, profile: (await response.json()) as ProfilePayload };
  } catch {
    return { ok: false, reason: 'server' };
  }
}

/** Player-facing copy per failure mode (distinct, actionable). */
export const LOCK_FAILURE_COPY: Record<LockFailure, string> = {
  auth_failed: 'Session expired. Tap lock again to start fresh.',
  duplicate_category: 'One live call per category. Wait for your current one to settle.',
  window_too_short: 'Too close to the deadline. Pick a call with more room.',
  not_in_running: 'Calls are open only while the clock is running.',
  unknown_option: 'The market moved and this call rotated. A fresh deck is coming.',
  unknown_fixture: 'This match is not live on the feed yet.',
  network: 'Could not reach the game server. Check your connection and retry.',
  server: 'The game server had a hiccup. Retry in a moment.',
};
