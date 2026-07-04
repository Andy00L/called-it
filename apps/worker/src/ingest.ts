import {
  oddsStreamUrl,
  scoresStreamUrl,
  startGuestSession,
  StreamHttpError,
  streamJson,
  type OddsPayload,
  type ScoresUpdate,
  type TxlineNetworkConfig,
} from '@calledit/txline';
import type { TapeStream } from './tape.js';

/**
 * Long-lived consumption of the two global TxLINE streams. Both streams carry
 * every subscribed fixture; filtering happens downstream. The loop must
 * survive server closes, stalls, and JWT expiry for whole match days.
 */

// Reconnect policy. Backoff doubles per failed attempt and resets after a
// connection that lived longer than STABLE_CONNECTION_MS.
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 60000;
const STABLE_CONNECTION_MS = 60000;

// No frame (data or heartbeat) for this long means the connection is dead.
// Heartbeat cadence is not documented; 90s gives ample margin and will be
// tightened once a live match confirms the real cadence (docs/FEEDBACK.md).
const STALL_TIMEOUT_MS = 90000;

export interface IngestAuthState {
  jwt: string;
  apiToken: string;
}

export interface IngestHooks {
  onScoresUpdate(update: ScoresUpdate, receivedAtMs: number): void;
  onOddsPayload(payload: OddsPayload, receivedAtMs: number): void;
  onHeartbeat(stream: TapeStream, receivedAtMs: number): void;
}

interface SharedAuth {
  current: IngestAuthState;
  refreshInFlight: Promise<boolean> | null;
}

/** Re-acquire the guest JWT once, shared across both stream loops. */
async function refreshGuestJwt(cfg: TxlineNetworkConfig, shared: SharedAuth): Promise<boolean> {
  if (shared.refreshInFlight === null) {
    shared.refreshInFlight = (async () => {
      const session = await startGuestSession(cfg);
      shared.refreshInFlight = null;
      if (!session.ok) {
        console.error(`[refreshGuestJwt] failed: ${session.error.message}`);
        return false;
      }
      shared.current = { jwt: session.value, apiToken: shared.current.apiToken };
      console.log('[refreshGuestJwt] guest JWT re-acquired');
      return true;
    })();
  }
  return shared.refreshInFlight;
}

function sleepUnlessAborted(delayMs: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolvePromise) => {
    if (signal.aborted) {
      resolvePromise();
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolvePromise();
    }, delayMs);
    const onAbort = (): void => {
      clearTimeout(timer);
      resolvePromise();
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function runStreamIngest<TPayload>(
  stream: TapeStream,
  url: string,
  cfg: TxlineNetworkConfig,
  shared: SharedAuth,
  signal: AbortSignal,
  handlePayload: (payload: TPayload, receivedAtMs: number) => void,
  onHeartbeat: (receivedAtMs: number) => void,
): Promise<void> {
  let backoffMs = INITIAL_BACKOFF_MS;

  while (!signal.aborted) {
    const connectionStartedAtMs = Date.now();
    const stallController = new AbortController();
    const abortInner = (): void => stallController.abort();
    signal.addEventListener('abort', abortInner, { once: true });
    let stallTimer = setTimeout(abortInner, STALL_TIMEOUT_MS);
    const resetStallTimer = (): void => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(abortInner, STALL_TIMEOUT_MS);
    };

    let reconnectImmediately = false;
    try {
      const headers = {
        Authorization: `Bearer ${shared.current.jwt}`,
        'X-Api-Token': shared.current.apiToken,
      };
      console.log(`[runStreamIngest] ${stream}: connecting`);
      for await (const message of streamJson<TPayload>(url, {
        headers,
        signal: stallController.signal,
      })) {
        resetStallTimer();
        const receivedAtMs = Date.now();
        if (message.kind === 'heartbeat') {
          onHeartbeat(receivedAtMs);
          continue;
        }
        handlePayload(message.payload, receivedAtMs);
      }
      console.log(`[runStreamIngest] ${stream}: server closed the stream`);
    } catch (cause) {
      if (!signal.aborted) {
        if (cause instanceof StreamHttpError && cause.status === 401) {
          console.warn(`[runStreamIngest] ${stream}: JWT expired (401), refreshing`);
          reconnectImmediately = await refreshGuestJwt(cfg, shared);
        } else if (stallController.signal.aborted) {
          console.warn(
            `[runStreamIngest] ${stream}: no frame for ${STALL_TIMEOUT_MS}ms, reconnecting`,
          );
        } else {
          const messageText = cause instanceof Error ? cause.message : String(cause);
          console.error(`[runStreamIngest] ${stream}: stream error: ${messageText}`);
        }
      }
    } finally {
      clearTimeout(stallTimer);
      signal.removeEventListener('abort', abortInner);
    }

    if (signal.aborted) {
      break;
    }
    if (Date.now() - connectionStartedAtMs > STABLE_CONNECTION_MS) {
      backoffMs = INITIAL_BACKOFF_MS;
    }
    if (!reconnectImmediately) {
      await sleepUnlessAborted(backoffMs, signal);
      backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
    }
  }
  console.log(`[runStreamIngest] ${stream}: stopped`);
}

/** Run both stream loops until the signal aborts. */
export async function runIngest(
  cfg: TxlineNetworkConfig,
  auth: IngestAuthState,
  hooks: IngestHooks,
  signal: AbortSignal,
): Promise<void> {
  const shared: SharedAuth = { current: auth, refreshInFlight: null };
  await Promise.all([
    runStreamIngest<ScoresUpdate>(
      'scores',
      scoresStreamUrl(cfg),
      cfg,
      shared,
      signal,
      hooks.onScoresUpdate,
      (receivedAtMs) => hooks.onHeartbeat('scores', receivedAtMs),
    ),
    runStreamIngest<OddsPayload>(
      'odds',
      oddsStreamUrl(cfg),
      cfg,
      shared,
      signal,
      hooks.onOddsPayload,
      (receivedAtMs) => hooks.onHeartbeat('odds', receivedAtMs),
    ),
  ]);
}
