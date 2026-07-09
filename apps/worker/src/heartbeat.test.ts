import assert from 'node:assert/strict';
import { test } from 'node:test';
import { err } from '@calledit/txline';
import { createSupabaseHeartbeat } from './heartbeat.js';
import { createMemoryPersistence } from './persistence-memory.js';
import type { PersistencePort } from './persistence.js';

test('runOnce performs exactly one cheap read through the port', async () => {
  const base = createMemoryPersistence();
  let readCount = 0;
  const countingPort: PersistencePort = {
    ...base,
    leaderboardGlobal: async (limit) => {
      readCount += 1;
      return base.leaderboardGlobal(limit);
    },
  };
  const heartbeat = createSupabaseHeartbeat({ persistence: countingPort });
  await heartbeat.runOnce();
  assert.equal(readCount, 1);
});

test('runOnce resolves without throwing when the read fails', async () => {
  const base = createMemoryPersistence();
  const failingPort: PersistencePort = {
    ...base,
    leaderboardGlobal: async () => err('connection refused'),
  };
  const heartbeat = createSupabaseHeartbeat({ persistence: failingPort });
  await heartbeat.runOnce();
});

test('start is idempotent and stop clears the timer', () => {
  const heartbeat = createSupabaseHeartbeat({ persistence: createMemoryPersistence() });
  heartbeat.start();
  heartbeat.start();
  heartbeat.stop();
  heartbeat.stop();
});
