import type { GuestSession } from '@calledit/contracts';
import { workerUrl } from './api';

/**
 * Guest identity, client-side only (import from client components).
 *
 * localStorage is required by the product here: the approved scope is
 * guest-first play, and an identity that vanished on reload would zero the
 * player's points and streaks (build plan, onboarding: playable as guest).
 * The stored token only grants access to this game's picks.
 */

const STORAGE_KEY = 'calledit.guest.v1';

export function readStoredSession(): GuestSession | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === null) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as GuestSession;
    if (
      typeof parsed.playerId === 'string' &&
      typeof parsed.playerToken === 'string' &&
      typeof parsed.handle === 'string'
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearStoredSession(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

function generateHandle(): string {
  // Handle constraint: 2 to 24 chars of letters/numbers/space/_ . - (game.ts).
  return `Fan ${Math.floor(1000 + Math.random() * 9000)}`;
}

export type GuestSessionResult =
  | { ok: true; session: GuestSession }
  | { ok: false; reason: 'network' | 'server' };

/** Return the stored session, or create a fresh guest and store it. */
export async function ensureGuestSession(): Promise<GuestSessionResult> {
  const stored = readStoredSession();
  if (stored !== null) {
    return { ok: true, session: stored };
  }

  let response: Response;
  try {
    response = await fetch(`${workerUrl()}/players/guest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handle: generateHandle() }),
    });
  } catch {
    return { ok: false, reason: 'network' };
  }
  if (!response.ok) {
    return { ok: false, reason: 'server' };
  }
  try {
    const session = (await response.json()) as GuestSession;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    return { ok: true, session };
  } catch {
    return { ok: false, reason: 'server' };
  }
}
