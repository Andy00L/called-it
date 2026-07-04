import type { GuestSession, LockResult } from '@calledit/contracts';
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
