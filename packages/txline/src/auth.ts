import type { TxlineNetworkConfig } from './config.js';
import { apiPost } from './http.js';
import { err, ok, type Result } from './result.js';

interface TokenResponse {
  token: string;
}

/** POST /auth/guest/start : anonymous guest JWT, 30 day expiry. */
export async function startGuestSession(cfg: TxlineNetworkConfig): Promise<Result<string>> {
  const raw = await apiPost(`${cfg.apiOrigin}/auth/guest/start`, {}, {});
  if (!raw.ok) {
    return raw;
  }
  try {
    const parsed = JSON.parse(raw.value) as TokenResponse;
    if (typeof parsed.token !== 'string' || parsed.token.length === 0) {
      return err({ code: 'parse_error', message: 'guest/start: missing token field' });
    }
    return ok(parsed.token);
  } catch (cause) {
    return err({ code: 'parse_error', message: 'guest/start: invalid JSON', cause });
  }
}

/**
 * Message that the wallet must sign (ed25519 detached) to activate the API token.
 * Format confirmed by the quickstart: "txSig:league1,league2:jwt", signature base64.
 */
export function buildActivationMessage(txSig: string, leagues: number[], jwt: string): Uint8Array {
  const messageString = `${txSig}:${leagues.join(',')}:${jwt}`;
  return new TextEncoder().encode(messageString);
}

export interface ActivationInput {
  jwt: string;
  /** Signature of the on-chain subscribe transaction. */
  txSig: string;
  /** Custom league ids; empty for standard World Cup tiers. */
  leagues: number[];
  /** Detached ed25519 signer over arbitrary bytes (wallet secret key stays outside this lib). */
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
}

/** POST /api/token/activate : returns the long-lived API token (plain text). */
export async function activateApiToken(
  cfg: TxlineNetworkConfig,
  input: ActivationInput,
): Promise<Result<string>> {
  const message = buildActivationMessage(input.txSig, input.leagues, input.jwt);
  const signature = await input.signMessage(message);
  const walletSignature = Buffer.from(signature).toString('base64');
  const raw = await apiPost(
    `${cfg.apiBaseUrl}/token/activate`,
    { txSig: input.txSig, walletSignature, leagues: input.leagues },
    { Authorization: `Bearer ${input.jwt}` },
  );
  if (!raw.ok) {
    return raw;
  }
  const token = raw.value.trim();
  if (token.length === 0) {
    return err({ code: 'parse_error', message: 'token/activate: empty token response' });
  }
  return ok(token);
}
