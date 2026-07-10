import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRateLimiter } from './rate-limit.js';

/** Deterministic clock so the fixed windows are exercised without real time. */
function createClock(startMs: number): { nowMs: () => number; advance(ms: number): void } {
  let current = startMs;
  return {
    nowMs: () => current,
    advance: (ms) => {
      current += ms;
    },
  };
}

test('allows up to the limit then rejects within the window', () => {
  const clock = createClock(1000);
  const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 3, nowMs: clock.nowMs });

  assert.equal(limiter.check('ip-a').allowed, true);
  assert.equal(limiter.check('ip-a').allowed, true);
  assert.equal(limiter.check('ip-a').allowed, true);
  const blocked = limiter.check('ip-a');
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterMs > 0 && blocked.retryAfterMs <= 60_000);
});

test('separate keys have separate budgets', () => {
  const clock = createClock(0);
  const limiter = createRateLimiter({ windowMs: 1000, maxRequests: 1, nowMs: clock.nowMs });
  assert.equal(limiter.check('ip-a').allowed, true);
  assert.equal(limiter.check('ip-a').allowed, false);
  // A different key is untouched by ip-a's exhausted budget.
  assert.equal(limiter.check('ip-b').allowed, true);
});

test('the budget resets when the window elapses', () => {
  const clock = createClock(0);
  const limiter = createRateLimiter({ windowMs: 1000, maxRequests: 2, nowMs: clock.nowMs });
  assert.equal(limiter.check('ip-a').allowed, true);
  assert.equal(limiter.check('ip-a').allowed, true);
  assert.equal(limiter.check('ip-a').allowed, false);
  clock.advance(1000);
  assert.equal(limiter.check('ip-a').allowed, true);
});

test('a key flood is swept so the map does not grow without bound', () => {
  const clock = createClock(0);
  const limiter = createRateLimiter({
    windowMs: 1000,
    maxRequests: 1,
    nowMs: clock.nowMs,
    maxTrackedKeys: 4,
  });
  for (let index = 0; index < 4; index += 1) {
    assert.equal(limiter.check(`ip-${index}`).allowed, true);
  }
  // Those windows expire; the next distinct key triggers a sweep and the
  // earlier keys are forgotten (so they get a fresh budget, proving cleanup).
  clock.advance(1000);
  assert.equal(limiter.check('ip-new').allowed, true);
  assert.equal(limiter.check('ip-0').allowed, true);
});
