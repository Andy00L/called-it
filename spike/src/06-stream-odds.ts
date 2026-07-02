import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { oddsStreamUrl, streamJson, type OddsPayload } from '@calledit/txline';
import { readEnv, requireValue } from './env.js';

const env = readEnv();
const jwt = requireValue(env.jwt, 'TXLINE_JWT', 'Run: pnpm --filter @calledit/spike auth');
const apiToken = requireValue(
  env.apiToken,
  'TXLINE_API_TOKEN',
  'Run: pnpm --filter @calledit/spike activate',
);

const fixtureFilterArg = process.argv[2];
const fixtureFilter = fixtureFilterArg !== undefined ? Number.parseInt(fixtureFilterArg, 10) : undefined;

const logsDir = resolve(import.meta.dirname, '../logs');
mkdirSync(logsDir, { recursive: true });
const logFile = resolve(logsDir, `odds-${new Date().toISOString().slice(0, 10)}.ndjson`);
console.log(
  `Streaming odds (${env.cfg.network})${fixtureFilter !== undefined ? ` filtered to fixture ${fixtureFilter}` : ''}. Logging to ${logFile}`,
);
console.log('Ctrl+C to stop.\n');

const url = oddsStreamUrl(env.cfg);
const headers = { Authorization: `Bearer ${jwt}`, 'X-Api-Token': apiToken };

let events = 0;
let heartbeats = 0;

for await (const message of streamJson<OddsPayload>(url, { headers })) {
  if (message.kind === 'heartbeat') {
    heartbeats += 1;
    if (heartbeats % 10 === 1) {
      console.log(`[heartbeat] total=${heartbeats} events=${events}`);
    }
    continue;
  }
  const odds = message.payload;
  if (fixtureFilter !== undefined && odds.FixtureId !== fixtureFilter) continue;

  events += 1;
  appendFileSync(logFile, `${JSON.stringify(odds)}\n`);

  const latencyMs = Date.now() - odds.Ts;
  const stable = odds.Pct !== undefined ? odds.Pct.join('/') : 'no-pct';
  console.log(
    `fixture=${odds.FixtureId} ${odds.SuperOddsType} [${odds.PriceNames.join('/')}] ` +
      `pct=${stable} inRunning=${odds.InRunning} book=${odds.Bookmaker} latency=${latencyMs}ms`,
  );
}

console.log('Stream ended (server closed the connection).');
