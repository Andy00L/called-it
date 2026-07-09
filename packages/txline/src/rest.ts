import type { TxlineNetworkConfig } from './config.js';
import { apiGetJson, type AuthHeaders } from './http.js';
import type { Result } from './result.js';
import type { Fixture, OddsPayload, ScoresStatValidation, ScoresUpdate } from './types.js';

/** GET /api/fixtures/snapshot : latest fixtures within a 30 day window. */
export function fetchFixturesSnapshot(
  cfg: TxlineNetworkConfig,
  auth: AuthHeaders,
): Promise<Result<Fixture[]>> {
  return apiGetJson<Fixture[]>(cfg, '/fixtures/snapshot', auth);
}

/** GET /api/odds/snapshot/{fixtureId} : latest odds for all markets of a fixture. */
export function fetchOddsSnapshot(
  cfg: TxlineNetworkConfig,
  auth: AuthHeaders,
  fixtureId: number,
): Promise<Result<OddsPayload[]>> {
  return apiGetJson<OddsPayload[]>(cfg, `/odds/snapshot/${fixtureId}`, auth);
}

/** GET /api/odds/updates/{fixtureId} : live odds updates from the current 5 minute cache. */
export function fetchOddsUpdates(
  cfg: TxlineNetworkConfig,
  auth: AuthHeaders,
  fixtureId: number,
): Promise<Result<OddsPayload[]>> {
  return apiGetJson<OddsPayload[]>(cfg, `/odds/updates/${fixtureId}`, auth);
}

/** GET /api/odds/updates/{epochDay}/{hourOfDay}/{interval} : historical 5 minute interval. */
export function fetchOddsInterval(
  cfg: TxlineNetworkConfig,
  auth: AuthHeaders,
  epochDay: number,
  hourOfDay: number,
  interval: number,
): Promise<Result<OddsPayload[]>> {
  return apiGetJson<OddsPayload[]>(cfg, `/odds/updates/${epochDay}/${hourOfDay}/${interval}`, auth);
}

/** GET /api/scores/snapshot/{fixtureId} : latest score event snapshots. */
export function fetchScoresSnapshot(
  cfg: TxlineNetworkConfig,
  auth: AuthHeaders,
  fixtureId: number,
): Promise<Result<ScoresUpdate[]>> {
  return apiGetJson<ScoresUpdate[]>(cfg, `/scores/snapshot/${fixtureId}`, auth);
}

/** GET /api/scores/updates/{fixtureId} : live score updates from the current 5 minute cache. */
export function fetchScoresUpdates(
  cfg: TxlineNetworkConfig,
  auth: AuthHeaders,
  fixtureId: number,
): Promise<Result<ScoresUpdate[]>> {
  return apiGetJson<ScoresUpdate[]>(cfg, `/scores/updates/${fixtureId}`, auth);
}

/** GET /api/scores/historical/{fixtureId} : full history (2 weeks to 6 hours past). Time Machine fuel. */
export function fetchScoresHistorical(
  cfg: TxlineNetworkConfig,
  auth: AuthHeaders,
  fixtureId: number,
): Promise<Result<ScoresUpdate[]>> {
  return apiGetJson<ScoresUpdate[]>(cfg, `/scores/historical/${fixtureId}`, auth);
}

export interface StatValidationQuery {
  fixtureId: number;
  /** Sequence number of the scores event whose stats are being proven. */
  seq: number;
  statKey: number;
  /** Optional second stat of the same event (two-stat predicates). */
  statKey2?: number;
}

/**
 * GET /api/scores/stat-validation : Merkle proofs connecting one or two stats
 * of a scores event to the daily batch root published on-chain (Txoracle).
 */
export function fetchScoresStatValidation(
  cfg: TxlineNetworkConfig,
  auth: AuthHeaders,
  query: StatValidationQuery,
): Promise<Result<ScoresStatValidation>> {
  const parameters = new URLSearchParams({
    fixtureId: String(query.fixtureId),
    seq: String(query.seq),
    statKey: String(query.statKey),
  });
  if (query.statKey2 !== undefined) {
    parameters.set('statKey2', String(query.statKey2));
  }
  return apiGetJson<ScoresStatValidation>(
    cfg,
    `/scores/stat-validation?${parameters.toString()}`,
    auth,
  );
}

export function scoresStreamUrl(cfg: TxlineNetworkConfig): string {
  return `${cfg.apiBaseUrl}/scores/stream`;
}

export function oddsStreamUrl(cfg: TxlineNetworkConfig): string {
  return `${cfg.apiBaseUrl}/odds/stream`;
}
