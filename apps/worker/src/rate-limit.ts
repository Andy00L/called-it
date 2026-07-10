/**
 * Fixed-window rate limiter, in memory, keyed by an opaque string (a client
 * IP in production). Public POST endpoints use it to blunt guest-creation and
 * pick spam without a database or an external service. The window is coarse on
 * purpose: this is abuse control for a free-to-play game, not billing.
 */

export interface RateLimitDecision {
  allowed: boolean;
  /** Milliseconds until the current window resets (0 when allowed). */
  retryAfterMs: number;
}

export interface RateLimiterOptions {
  /** Window length in milliseconds. */
  windowMs: number;
  /** Requests permitted per key per window. */
  maxRequests: number;
  /** Injectable clock for tests; defaults to Date.now. */
  nowMs?: () => number;
  /** Distinct keys tracked before a sweep of expired entries is forced. */
  maxTrackedKeys?: number;
}

export interface RateLimiter {
  check(key: string): RateLimitDecision;
}

// Upper bound on tracked keys before a sweep runs; guards memory against a
// flood of distinct source IPs (each entry is tiny, this is a safety net).
const DEFAULT_MAX_TRACKED_KEYS = 50_000;

interface WindowState {
  count: number;
  windowStartMs: number;
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const nowMs = options.nowMs ?? Date.now;
  const maxTrackedKeys = options.maxTrackedKeys ?? DEFAULT_MAX_TRACKED_KEYS;
  const windows = new Map<string, WindowState>();

  // Drop every window whose period has fully elapsed; called only when the map
  // grows past the cap, so the common path stays O(1).
  const sweepExpired = (currentMs: number): void => {
    for (const [key, state] of windows) {
      if (currentMs - state.windowStartMs >= options.windowMs) {
        windows.delete(key);
      }
    }
  };

  return {
    check: (key) => {
      const currentMs = nowMs();
      const existing = windows.get(key);
      if (existing === undefined || currentMs - existing.windowStartMs >= options.windowMs) {
        if (windows.size >= maxTrackedKeys) {
          sweepExpired(currentMs);
        }
        windows.set(key, { count: 1, windowStartMs: currentMs });
        return { allowed: true, retryAfterMs: 0 };
      }
      if (existing.count >= options.maxRequests) {
        return {
          allowed: false,
          retryAfterMs: options.windowMs - (currentMs - existing.windowStartMs),
        };
      }
      existing.count += 1;
      return { allowed: true, retryAfterMs: 0 };
    },
  };
}
