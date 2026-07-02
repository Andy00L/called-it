import nacl from 'tweetnacl';
import { activateApiToken } from '@calledit/txline';
import { loadKeypair, readEnv, requireValue } from './env.js';

const env = readEnv();
const jwt = requireValue(env.jwt, 'TXLINE_JWT', 'Run: pnpm --filter @calledit/spike auth');
const txSig = requireValue(
  env.txSig,
  'TXLINE_TX_SIG',
  'Run: pnpm --filter @calledit/spike subscribe',
);
const keypair = loadKeypair(env.walletKeypairPath);

const leagues: number[] = [];
const activation = await activateApiToken(env.cfg, {
  jwt,
  txSig,
  leagues,
  signMessage: (message) => Promise.resolve(nacl.sign.detached(message, keypair.secretKey)),
});

if (!activation.ok) {
  console.error(`token/activate failed: ${activation.error.message}`);
  process.exit(1);
}

console.log('API token activated. Add this line to .env:');
console.log('');
console.log(`TXLINE_API_TOKEN=${activation.value}`);
