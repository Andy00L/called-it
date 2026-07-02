import {
  fetchFixturesSnapshot,
  fetchOddsSnapshot,
  fetchScoresSnapshot,
} from '@calledit/txline';
import { readEnv, requireValue } from './env.js';

const env = readEnv();
const jwt = requireValue(env.jwt, 'TXLINE_JWT', 'Run: pnpm --filter @calledit/spike auth');
const apiToken = requireValue(
  env.apiToken,
  'TXLINE_API_TOKEN',
  'Run: pnpm --filter @calledit/spike activate',
);
const auth = { jwt, apiToken };

const fixtures = await fetchFixturesSnapshot(env.cfg, auth);
if (!fixtures.ok) {
  console.error(`fixtures/snapshot failed: ${fixtures.error.message}`);
  process.exit(1);
}

console.log(`Fixtures in window: ${fixtures.value.length}`);
const byCompetition = new Map<string, number>();
for (const fixture of fixtures.value) {
  byCompetition.set(fixture.Competition, (byCompetition.get(fixture.Competition) ?? 0) + 1);
}
for (const [competition, count] of byCompetition) {
  console.log(`  ${competition}: ${count}`);
}

const upcoming = [...fixtures.value]
  .sort((a, b) => a.StartTime - b.StartTime)
  .slice(0, 20);
console.log('\nNext 20 fixtures:');
for (const fixture of upcoming) {
  const start = new Date(fixture.StartTime).toISOString();
  console.log(
    `  ${fixture.FixtureId}  ${start}  ${fixture.Participant1} vs ${fixture.Participant2}  (${fixture.Competition})`,
  );
}

const fixtureIdArg = process.argv[2];
if (fixtureIdArg !== undefined) {
  const fixtureId = Number.parseInt(fixtureIdArg, 10);
  console.log(`\nDetail for fixture ${fixtureId}:`);

  const odds = await fetchOddsSnapshot(env.cfg, auth, fixtureId);
  if (odds.ok) {
    console.log(`  odds records: ${odds.value.length}`);
    const markets = new Set(odds.value.map((record) => record.SuperOddsType));
    console.log(`  markets: ${[...markets].join(', ')}`);
    const sample = odds.value.find((record) => record.Pct !== undefined);
    if (sample !== undefined) {
      console.log(
        `  sample StablePrice: ${sample.SuperOddsType} ${sample.PriceNames.join('/')} -> ${(sample.Pct ?? []).join('/')}`,
      );
    }
  } else {
    console.error(`  odds/snapshot failed: ${odds.error.message}`);
  }

  const scores = await fetchScoresSnapshot(env.cfg, auth, fixtureId);
  if (scores.ok) {
    console.log(`  score events: ${scores.value.length}`);
    const last = scores.value.at(-1);
    if (last !== undefined) {
      console.log(`  last event: Action=${last.Action ?? '?'} GameState=${last.GameState ?? '?'}`);
    }
  } else {
    console.error(`  scores/snapshot failed: ${scores.error.message}`);
  }
}
