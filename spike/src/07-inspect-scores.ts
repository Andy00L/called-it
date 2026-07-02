import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fetchScoresHistorical, fetchScoresSnapshot, type ScoresUpdate } from '@calledit/txline';
import { readEnv, requireValue } from './env.js';

const env = readEnv();
const jwt = requireValue(env.jwt, 'TXLINE_JWT', 'Run: auth');
const apiToken = requireValue(env.apiToken, 'TXLINE_API_TOKEN', 'Run: activate');
const auth = { jwt, apiToken };

const fixtureIdArg = process.argv[2];
const fixtureId = Number.parseInt(requireValue(fixtureIdArg, 'fixtureId arg', 'Pass a fixture id'), 10);

const historical = await fetchScoresHistorical(env.cfg, auth, fixtureId);
let events: ScoresUpdate[] = [];
if (historical.ok) {
  events = historical.value;
} else {
  console.log(`historical failed (${historical.error.message}); using snapshot instead`);
  const snapshot = await fetchScoresSnapshot(env.cfg, auth, fixtureId);
  if (snapshot.ok) {
    events = snapshot.value;
  } else {
    console.error(`snapshot also failed: ${snapshot.error.message}`);
    process.exit(1);
  }
}
console.log(`Events: ${events.length}\n`);

const logsDir = resolve(import.meta.dirname, '../logs');
mkdirSync(logsDir, { recursive: true });
const rawPath = resolve(logsDir, `inspect-scores-${fixtureId}.json`);
writeFileSync(rawPath, JSON.stringify(events, null, 2));
console.log(`Raw dump: ${rawPath}\n`);

// Union of top-level keys across all events.
const topKeys = new Set<string>();
const actions = new Map<string, number>();
const gameStates = new Map<string, number>();
const statKeys = new Set<string>();
let goalEvents = 0;
let cardEvents = 0;
let cornerBearing = 0;

for (const event of events as unknown as Array<Record<string, unknown>>) {
  for (const key of Object.keys(event)) topKeys.add(key);

  const action = typeof event['action'] === 'string' ? event['action'] : `<${typeof event['action']}>`;
  actions.set(action, (actions.get(action) ?? 0) + 1);

  const gameState =
    typeof event['gameState'] === 'string' ? event['gameState'] : `<${typeof event['gameState']}>`;
  gameStates.set(gameState, (gameStates.get(gameState) ?? 0) + 1);

  const stats = event['stats'];
  if (stats !== null && typeof stats === 'object') {
    for (const key of Object.keys(stats as Record<string, unknown>)) statKeys.add(key);
  }

  const soccer = event['dataSoccer'];
  if (soccer !== null && typeof soccer === 'object') {
    const s = soccer as Record<string, unknown>;
    if (s['Goal'] === true) goalEvents += 1;
    if (s['YellowCard'] === true || s['RedCard'] === true) cardEvents += 1;
  }
  const score = event['scoreSoccer'];
  if (score !== null && typeof score === 'object') cornerBearing += 1;
}

console.log('Top-level keys seen:');
console.log(`  ${[...topKeys].sort().join(', ')}\n`);

console.log('action values:');
for (const [value, count] of [...actions].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${value}: ${count}`);
}
console.log('\ngameState values:');
for (const [value, count] of [...gameStates].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${value}: ${count}`);
}
console.log(`\nstats map keys seen: ${[...statKeys].sort((a, b) => Number(a) - Number(b)).join(', ') || '(none)'}`);
console.log(`dataSoccer goal events: ${goalEvents}`);
console.log(`dataSoccer card events: ${cardEvents}`);
console.log(`events carrying scoreSoccer: ${cornerBearing}`);

// Print one full example of a goal event if present.
const goal = (events as unknown as Array<Record<string, unknown>>).find((event) => {
  const soccer = event['dataSoccer'];
  return soccer !== null && typeof soccer === 'object' && (soccer as Record<string, unknown>)['Goal'] === true;
});
if (goal !== undefined) {
  console.log('\nExample goal event:');
  console.log(JSON.stringify(goal, null, 2).slice(0, 1200));
}
