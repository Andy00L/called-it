import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { scoresStreamUrl, streamJson, type ScoresUpdate } from '@calledit/txline';
import { readEnv, requireValue } from './env.js';

const env = readEnv();
const jwt = requireValue(env.jwt, 'TXLINE_JWT', 'Run: pnpm --filter @calledit/spike auth');
const apiToken = requireValue(
  env.apiToken,
  'TXLINE_API_TOKEN',
  'Run: pnpm --filter @calledit/spike activate',
);

const logsDir = resolve(import.meta.dirname, '../logs');
mkdirSync(logsDir, { recursive: true });
const logFile = resolve(logsDir, `scores-${new Date().toISOString().slice(0, 10)}.ndjson`);
console.log(`Streaming scores (${env.cfg.network}). Logging to ${logFile}`);
console.log('Ctrl+C to stop.\n');

const url = scoresStreamUrl(env.cfg);
const headers = { Authorization: `Bearer ${jwt}`, 'X-Api-Token': apiToken };

let events = 0;
let heartbeats = 0;

for await (const message of streamJson<ScoresUpdate>(url, { headers })) {
  if (message.kind === 'heartbeat') {
    heartbeats += 1;
    if (heartbeats % 10 === 1) {
      console.log(`[heartbeat] total=${heartbeats} events=${events}`);
    }
    continue;
  }
  events += 1;
  const update = message.payload;
  appendFileSync(logFile, `${JSON.stringify(update)}\n`);

  const latencyMs = Date.now() - update.Ts;
  const clock = update.Clock !== undefined ? `${Math.floor(update.Clock.Seconds / 60)}'` : '';
  const flags = [
    update.Confirmed === true ? 'confirmed' : 'unconfirmed',
    update.PossessionType ?? '',
  ]
    .filter((flag) => flag !== '')
    .join(' ');

  console.log(
    `fixture=${update.FixtureId} ${clock} action=${update.Action ?? '?'} p${update.Participant ?? '-'} ` +
      `latency=${latencyMs}ms ${flags}`,
  );
}

console.log('Stream ended (server closed the connection).');
