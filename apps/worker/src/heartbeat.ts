import type { PersistencePort } from './persistence.js';

/**
 * Supabase free tier pauses a project after 7 idle days. The worker runs
 * 24/7, so one cheap read per day keeps the database awake through the
 * judging window (late July) even when no match traffic hits persistence.
 * Same injected-deps shape as the commitment batcher so tests run without
 * a database.
 */

// One read per day is enough: the pause threshold is 7 idle days.
export const HEARTBEAT_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface HeartbeatDeps {
  persistence: PersistencePort;
}

export interface SupabaseHeartbeat {
  runOnce(): Promise<void>;
  start(): void;
  stop(): void;
}

export function createSupabaseHeartbeat(deps: HeartbeatDeps): SupabaseHeartbeat {
  let timer: NodeJS.Timeout | null = null;

  const runOnce = async (): Promise<void> => {
    // leaderboardGlobal(1) is the cheapest read the port exposes (one row
    // from a view); the goal is the round trip, not the data.
    const read = await deps.persistence.leaderboardGlobal(1);
    if (!read.ok) {
      console.error(`[SupabaseHeartbeat] keep-alive read failed: ${read.error}`);
      return;
    }
    console.log('[SupabaseHeartbeat] keep-alive read ok');
  };

  return {
    runOnce,
    start: () => {
      if (timer !== null) {
        return;
      }
      timer = setInterval(() => {
        void runOnce();
      }, HEARTBEAT_INTERVAL_MS);
    },
    stop: () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    },
  };
}
