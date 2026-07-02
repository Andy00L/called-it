import { startGuestSession } from '@calledit/txline';
import { readEnv } from './env.js';

const env = readEnv();
console.log(`Network: ${env.cfg.network} (${env.cfg.apiOrigin})`);

const session = await startGuestSession(env.cfg);
if (!session.ok) {
  console.error(`guest/start failed: ${session.error.message}`);
  process.exit(1);
}

console.log('Guest JWT acquired (valid 30 days). Add this line to .env:');
console.log('');
console.log(`TXLINE_JWT=${session.value}`);
