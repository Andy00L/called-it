import type { IncomingMessage } from 'node:http';
import { resolve } from 'node:path';
import type { LivePayload, ReceiptPayload } from '@calledit/contracts';
import { ok, type Result } from '@calledit/txline';
import { appendTapeEntry, openTapeDeck } from './tape.js';
import {
  createCommitmentBatcher,
  hashPickLeaf,
  verifyMerkleProof,
} from './commitments.js';
import { createMemoPoster } from './memo-poster.js';
import { createSupabaseHeartbeat } from './heartbeat.js';
import { createLatencyTracker, recordLatency, snapshotLatency } from './latency.js';
import { buildLivePayloadForState } from './live-payload.js';
import { createOracleVerifier } from './oracle-verify.js';
import { createReplayManager, type ReplayManager } from './replay.js';
import {
  applyOddsPayload,
  applyScoresUpdate,
  createMatchStateStore,
  getMatchState,
  listMatchStates,
} from './state.js';
import { createFanout, type ApiResult } from './fanout.js';
import { createSharedAuth, runIngest } from './ingest.js';
import { createFixtureCatalog, summarizeFixtures } from './fixtures.js';
import { readWorkerEnv } from './env.js';
import { createGameService, NEAR_MISS_HORIZON_SECONDS, type GameService } from './game.js';
import { findNearMissEvent } from '@calledit/engine';
import { createSponsorService, type SponsorService } from './sponsors.js';
import { createSponsorPayments } from './sponsor-payments.js';
import { createMemoryPersistence } from './persistence-memory.js';
import { createSupabasePersistence } from './persistence-supabase.js';
import { createWalletVerifier } from './wallet-auth.js';

// Milliseconds the clean shutdown gets before the process force-exits 0.
// Railway marks an instance crashed when it outlives the stop grace period,
// which produced a false "Deploy Crashed" email on every redeploy.
const SHUTDOWN_GRACE_MS = 5000;

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function asRecord(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
}

/** Map game-service error codes onto HTTP statuses (distinct per failure mode). */
function statusForGameError(code: string): number {
  if (code === 'auth_failed') {
    return 401;
  }
  if (code === 'unknown_fixture' || code === 'unknown_option' || code === 'unknown_player') {
    return 404;
  }
  if (
    code === 'duplicate_category' ||
    code === 'not_in_running' ||
    code === 'window_too_short' ||
    code === 'wallet_taken'
  ) {
    return 409;
  }
  if (code === 'wallet_unlinked') {
    return 404;
  }
  if (code === 'challenge_expired' || code === 'signature_mismatch') {
    return 401;
  }
  if (code.startsWith('invalid_')) {
    return 400;
  }
  return 500;
}

/** Replay-specific error codes onto HTTP statuses; game codes fall through. */
function statusForReplayError(code: string): number {
  if (code === 'unknown_session' || code === 'no_tape') {
    return 404;
  }
  if (code === 'replay_capacity') {
    return 429;
  }
  if (code === 'fixture_still_live') {
    return 409;
  }
  return statusForGameError(code);
}

/** Sponsorship error codes onto HTTP statuses (distinct per failure mode). */
function statusForSponsorError(code: string): number {
  if (code === 'unknown_intent') {
    return 404;
  }
  if (
    code === 'intent_expired' ||
    code === 'already_active' ||
    code === 'tx_already_used' ||
    code === 'payment_pending' ||
    code === 'payment_too_small' ||
    code === 'memo_mismatch' ||
    code === 'tx_failed'
  ) {
    return 409;
  }
  if (code === 'sponsorship_off') {
    return 503;
  }
  if (code.startsWith('invalid_')) {
    return 400;
  }
  return 500;
}

interface ReceiptSource {
  buildReceipt(pickId: string): Promise<Result<ReceiptPayload | null, string>>;
}

function buildApiHandler(
  game: GameService,
  receipts: ReceiptSource,
  replay: ReplayManager,
  sponsors: SponsorService,
) {
  return async (
    method: string,
    segments: string[],
    body: unknown,
    headers: IncomingMessage['headers'],
  ): Promise<ApiResult | null> => {
    if (segments[0] === 'replay') {
      if (method === 'GET' && segments.length === 2 && segments[1] === 'tapes') {
        const tapes = replay.listTapes();
        if (!tapes.ok) {
          return { status: 500, body: { error: tapes.error } };
        }
        return { status: 200, body: tapes.value };
      }
      if (method === 'POST' && segments.length === 2 && segments[1] === 'sessions') {
        const record = asRecord(body);
        const created = await replay.createSession(record['fixtureId'], record['speed']);
        if (!created.ok) {
          return { status: statusForReplayError(created.error), body: { error: created.error } };
        }
        return { status: 200, body: created.value };
      }
      if (segments.length >= 3 && segments[1] === 'sessions') {
        const sessionId = segments[2] ?? '';
        if (method === 'GET' && segments.length === 3) {
          const info = replay.sessionInfo(sessionId);
          if (!info.ok) {
            return { status: statusForReplayError(info.error), body: { error: info.error } };
          }
          return { status: 200, body: info.value };
        }
        if (method === 'POST' && segments.length === 4 && segments[3] === 'picks') {
          const locked = await replay.lockPick(sessionId, asRecord(body)['optionId']);
          if (!locked.ok) {
            return { status: statusForReplayError(locked.error), body: { error: locked.error } };
          }
          return { status: 200, body: locked.value };
        }
        if (method === 'POST' && segments.length === 4 && segments[3] === 'speed') {
          const updated = replay.setSpeed(sessionId, asRecord(body)['speed']);
          if (!updated.ok) {
            return { status: statusForReplayError(updated.error), body: { error: updated.error } };
          }
          return { status: 200, body: updated.value };
        }
        if (method === 'GET' && segments.length === 4 && segments[3] === 'profile') {
          const sessionProfile = await replay.profile(sessionId);
          if (!sessionProfile.ok) {
            return {
              status: statusForReplayError(sessionProfile.error),
              body: { error: sessionProfile.error },
            };
          }
          return { status: 200, body: sessionProfile.value };
        }
        if (method === 'GET' && segments.length === 4 && segments[3] === 'picks') {
          const sessionPicks = await replay.listPicks(sessionId);
          if (!sessionPicks.ok) {
            return {
              status: statusForReplayError(sessionPicks.error),
              body: { error: sessionPicks.error },
            };
          }
          return { status: 200, body: { picks: sessionPicks.value } };
        }
      }
      // GET /replay/sessions/:id/live is the SSE stream: fanout handles it.
    }

    if (method === 'GET' && segments.length === 2 && segments[0] === 'receipts') {
      const receipt = await receipts.buildReceipt(segments[1] ?? '');
      if (!receipt.ok) {
        return { status: 500, body: { error: receipt.error } };
      }
      if (receipt.value === null) {
        return { status: 404, body: { error: 'unknown_pick' } };
      }
      return { status: 200, body: receipt.value };
    }

    if (method === 'POST' && segments.length === 2 && segments[0] === 'players' && segments[1] === 'guest') {
      const created = await game.createGuestPlayer(asRecord(body)['handle']);
      if (!created.ok) {
        return { status: statusForGameError(created.error), body: { error: created.error } };
      }
      return { status: 200, body: created.value };
    }

    if (method === 'POST' && segments.length === 2 && segments[0] === 'players' && segments[1] === 'handle') {
      const renamed = await game.renameHandle(
        firstHeaderValue(headers['x-player-id']),
        firstHeaderValue(headers['x-player-token']),
        asRecord(body)['handle'],
      );
      if (!renamed.ok) {
        return { status: statusForGameError(renamed.error), body: { error: renamed.error } };
      }
      return { status: 200, body: renamed.value };
    }

    if (method === 'GET' && segments.length === 3 && segments[0] === 'players' && segments[1] === 'picks') {
      const myPicks = await game.listPlayerFixturePicks(
        firstHeaderValue(headers['x-player-id']),
        firstHeaderValue(headers['x-player-token']),
        segments[2],
      );
      if (!myPicks.ok) {
        return { status: statusForGameError(myPicks.error), body: { error: myPicks.error } };
      }
      return { status: 200, body: { picks: myPicks.value } };
    }

    if (segments[0] === 'sponsors') {
      if (method === 'GET' && segments.length === 2 && segments[1] === 'active') {
        const board = await sponsors.board();
        if (!board.ok) {
          return { status: 500, body: { error: board.error } };
        }
        return { status: 200, body: { sponsors: board.value } };
      }
      if (method === 'POST' && segments.length === 2 && segments[1] === 'preview') {
        const record = asRecord(body);
        const preview = await sponsors.preview(record['days'], record['weight']);
        if (!preview.ok) {
          return { status: statusForSponsorError(preview.error), body: { error: preview.error } };
        }
        return { status: 200, body: preview.value };
      }
      if (method === 'POST' && segments.length === 2 && segments[1] === 'quote') {
        const record = asRecord(body);
        const quote = await sponsors.requestQuote(
          record['name'],
          record['tagline'],
          record['days'],
          record['weight'],
        );
        if (!quote.ok) {
          return { status: statusForSponsorError(quote.error), body: { error: quote.error } };
        }
        return { status: 200, body: quote.value };
      }
      if (method === 'POST' && segments.length === 3 && segments[2] === 'transaction') {
        const built = await sponsors.buildTransaction(segments[1] ?? '', asRecord(body)['payerPubkey']);
        if (!built.ok) {
          return { status: statusForSponsorError(built.error), body: { error: built.error } };
        }
        return { status: 200, body: built.value };
      }
      if (method === 'POST' && segments.length === 3 && segments[2] === 'confirm') {
        const confirmed = await sponsors.confirm(segments[1] ?? '', asRecord(body)['signature']);
        if (!confirmed.ok) {
          return { status: statusForSponsorError(confirmed.error), body: { error: confirmed.error } };
        }
        return { status: 200, body: confirmed.value };
      }
    }

    if (method === 'GET' && segments.length === 2 && segments[0] === 'stats' && segments[1] === 'duel') {
      const stats = await game.duelStats();
      if (!stats.ok) {
        return { status: 500, body: { error: stats.error } };
      }
      return { status: 200, body: stats.value };
    }

    if (method === 'POST' && segments.length === 2 && segments[0] === 'players' && segments[1] === 'challenge') {
      // Fresh single-use challenge for the optional wallet link; no auth needed.
      return { status: 200, body: game.issueWalletChallenge() };
    }

    if (method === 'POST' && segments.length === 2 && segments[0] === 'players' && segments[1] === 'wallet-link') {
      const record = asRecord(body);
      const linked = await game.linkWallet(
        firstHeaderValue(headers['x-player-id']),
        firstHeaderValue(headers['x-player-token']),
        record['walletPubkey'],
        record['nonce'],
        record['signature'],
      );
      if (!linked.ok) {
        return { status: statusForGameError(linked.error), body: { error: linked.error } };
      }
      return { status: 200, body: linked.value };
    }

    if (method === 'POST' && segments.length === 2 && segments[0] === 'players' && segments[1] === 'wallet-restore') {
      const record = asRecord(body);
      const restored = await game.restoreWallet(
        record['walletPubkey'],
        record['nonce'],
        record['signature'],
      );
      if (!restored.ok) {
        return { status: statusForGameError(restored.error), body: { error: restored.error } };
      }
      return { status: 200, body: restored.value };
    }

    if (method === 'POST' && segments.length === 1 && segments[0] === 'picks') {
      const bodyRecord = asRecord(body);
      const locked = await game.lockPick(
        firstHeaderValue(headers['x-player-id']),
        firstHeaderValue(headers['x-player-token']),
        bodyRecord['fixtureId'],
        bodyRecord['optionId'],
      );
      if (!locked.ok) {
        return { status: statusForGameError(locked.error), body: { error: locked.error } };
      }
      return { status: 200, body: locked.value };
    }

    if (method === 'GET' && segments.length === 1 && segments[0] === 'leaderboard') {
      const rows = await game.leaderboardGlobal();
      if (!rows.ok) {
        return { status: 500, body: { error: rows.error } };
      }
      return { status: 200, body: rows.value };
    }

    if (method === 'GET' && segments.length === 2 && segments[0] === 'leaderboard') {
      const fixtureId = Number.parseInt(segments[1] ?? '', 10);
      if (!Number.isInteger(fixtureId) || fixtureId <= 0) {
        return { status: 400, body: { error: 'fixtureId must be a positive integer' } };
      }
      const rows = await game.leaderboardFixture(fixtureId);
      if (!rows.ok) {
        return { status: 500, body: { error: rows.error } };
      }
      return { status: 200, body: rows.value };
    }

    if (method === 'GET' && segments.length === 2 && segments[0] === 'profile') {
      const profile = await game.profile(segments[1]);
      if (!profile.ok) {
        return { status: statusForGameError(profile.error), body: { error: profile.error } };
      }
      return { status: 200, body: profile.value };
    }

    return null;
  };
}

async function main(): Promise<void> {
  const envResult = readWorkerEnv();
  if (!envResult.ok) {
    console.error(`[main] ${envResult.error}`);
    process.exitCode = 1;
    return;
  }
  const env = envResult.value;

  const deckResult = openTapeDeck(env.tapesDirectory);
  if (!deckResult.ok) {
    console.error(`[main] ${deckResult.error}`);
    process.exitCode = 1;
    return;
  }
  const tapeDeck = deckResult.value;

  const persistence =
    env.supabaseUrl !== undefined && env.supabaseSecretKey !== undefined
      ? createSupabasePersistence(env.supabaseUrl, env.supabaseSecretKey)
      : createMemoryPersistence();
  console.log(`[main] persistence backend: ${persistence.describeBackend()}`);
  if (persistence.describeBackend().startsWith('memory')) {
    console.warn('[main] SUPABASE_URL/SUPABASE_SECRET_KEY missing: picks are NOT durable');
  }

  const store = createMatchStateStore();
  const scoresLatency = createLatencyTracker();
  const oddsLatency = createLatencyTracker();
  const startedAtMs = Date.now();
  const lastHeartbeatMs: Record<'scores' | 'odds', number> = { scores: 0, odds: 0 };

  const sharedAuth = createSharedAuth({ jwt: env.jwt, apiToken: env.apiToken });
  // The seen-file lives inside the tapes directory (persistent volume on
  // Railway); the tape listing pattern ignores it (fixture-<id>.ndjson only).
  const fixtureCatalog = createFixtureCatalog(
    env.cfg,
    sharedAuth,
    resolve(env.tapesDirectory, 'fixtures-seen.ndjson'),
  );

  const buildLivePayload = (fixtureId: number): LivePayload | null => {
    const state = getMatchState(store, fixtureId);
    return state === undefined
      ? null
      : buildLivePayloadForState(state, scoresLatency, oddsLatency);
  };

  const walletVerifier = createWalletVerifier();
  const game = createGameService({
    persistence,
    store,
    walletVerifier,
    onSettlement: (notice) => {
      fanout.broadcastEvent(notice.fixtureId, 'settlement', notice);
    },
    onNearMiss: (notice) => {
      fanout.broadcastEvent(notice.fixtureId, 'near_miss', notice);
    },
  });

  // Oracle cross-check needs the wallet only as a read-only view signer;
  // absent wallet = the receipt field stays null (documented in contracts).
  const oracleVerifier =
    env.walletSecret === undefined
      ? null
      : createOracleVerifier({
          cfg: env.cfg,
          sharedAuth,
          rpcUrl: env.rpcUrl,
          walletSecret: env.walletSecret,
        });
  if (oracleVerifier === null) {
    console.warn('[main] no wallet configured: oracle verification is OFF');
  }

  const buildReceipt = async (pickId: string): Promise<Result<ReceiptPayload | null, string>> => {
    const fetched = await persistence.getReceipt(pickId);
    if (!fetched.ok) {
      return fetched;
    }
    if (fetched.value === null) {
      return ok(null);
    }
    const record = fetched.value;
    const fixture = fixtureCatalog
      .listFixtures()
      .find((candidate) => candidate.FixtureId === record.pick.fixtureId);
    // Near-miss fallback: before the 0003 column lands (or if the write
    // failed), recompute the margin from the in-memory match events while the
    // fixture state is still around. Persisted value wins when present.
    let settlement = record.settlement;
    if (
      settlement !== null &&
      settlement.outcome === 'miss' &&
      settlement.nearMissSeconds === null &&
      record.pick.predicate.kind === 'event_window'
    ) {
      const matchState = getMatchState(store, record.pick.fixtureId);
      const nearMissEvent =
        matchState === undefined
          ? null
          : findNearMissEvent(record.pick.predicate, matchState.events, NEAR_MISS_HORIZON_SECONDS);
      if (nearMissEvent !== null) {
        settlement = {
          ...settlement,
          nearMissSeconds: nearMissEvent.clockSeconds - record.pick.predicate.toClockSeconds,
        };
      }
    }
    const leafHashHex = hashPickLeaf(record.pick);
    const hasProof =
      record.commitment !== null && record.proof !== null && record.leafIndex !== null;
    // Only settled picks get the oracle cross-check: pending outcomes have
    // no final stats to prove yet.
    const oracleVerification =
      record.settlement === null || oracleVerifier === null
        ? null
        : await oracleVerifier.verifyCategory(record.pick.fixtureId, record.pick.category);
    return ok({
      pick: record.pick,
      playerHandle: record.playerHandle,
      settlement,
      oracleVerification,
      commitment:
        record.commitment === null || record.proof === null || record.leafIndex === null
          ? null
          : {
              commitmentId: record.commitment.id,
              rootHashHex: record.commitment.rootHashHex,
              memoTxSig: record.commitment.memoTxSig,
              leafIndex: record.leafIndex,
              leafHashHex,
              proof: record.proof,
              pickCount: record.commitment.pickCount,
              committedAtMs: record.commitment.createdAtMs,
            },
      proofValid: hasProof
        ? verifyMerkleProof(leafHashHex, record.proof ?? [], record.commitment?.rootHashHex ?? '')
        : null,
      fixture:
        fixture === undefined
          ? null
          : {
              participant1: fixture.Participant1,
              participant2: fixture.Participant2,
              competition: fixture.Competition,
            },
      network: env.cfg.network,
    });
  };

  const postMemo =
    env.walletSecret === undefined ? undefined : createMemoPoster(env.rpcUrl, env.walletSecret);
  if (postMemo === undefined) {
    console.warn('[main] no wallet configured: on-chain commitments are OFF');
  }
  const commitmentBatcher = createCommitmentBatcher({ persistence, postMemo });

  // Self-serve sponsorships pay the server wallet; without a wallet the
  // routes answer sponsorship_off instead of half-working.
  const sponsorPayments =
    env.walletSecret === undefined ? null : createSponsorPayments(env.rpcUrl, env.walletSecret);
  if (sponsorPayments === null) {
    console.warn('[main] no wallet configured: self-serve sponsorship is OFF');
  }
  const sponsorService = createSponsorService({ persistence, payments: sponsorPayments });

  // Time Machine: replays run on private stores and in-memory persistence;
  // fanout callbacks resolve at call time, after fanout exists below.
  const replayManager = createReplayManager({
    deck: tapeDeck,
    listFixtures: () => fixtureCatalog.listFixtures(),
    isFixtureLive: (fixtureId) => {
      const state = getMatchState(store, fixtureId);
      return state !== undefined && state.phase !== 'finished';
    },
    onState: (sessionId) => fanout.broadcastReplay(sessionId),
    onSettlement: (sessionId, notice) => fanout.broadcastReplayEvent(sessionId, 'settlement', notice),
    onNearMiss: (sessionId, notice) => fanout.broadcastReplayEvent(sessionId, 'near_miss', notice),
  });

  const fanout = createFanout({
    buildLivePayload,
    buildStatePayload: (fixtureId) => getMatchState(store, fixtureId) ?? null,
    buildFixturesPayload: () =>
      summarizeFixtures(fixtureCatalog.listFixtures(), listMatchStates(store)),
    buildHealthPayload: () => ({
      ok: true,
      network: env.cfg.network,
      persistence: persistence.describeBackend(),
      uptimeSeconds: Math.round((Date.now() - startedAtMs) / 1000),
      fixturesTracked: listMatchStates(store).length,
      pendingPicks: game.pendingPickCount(),
      sseClients: fanout.clientCount(),
      replaySessions: replayManager.activeSessionCount(),
      lastHeartbeatMs,
      latency: { scores: snapshotLatency(scoresLatency), odds: snapshotLatency(oddsLatency) },
    }),
    hasReplaySession: (sessionId) => replayManager.hasSession(sessionId),
    buildReplayPayload: (sessionId) => replayManager.buildPayload(sessionId),
    handleApiRequest: buildApiHandler(game, { buildReceipt }, replayManager, sponsorService),
  });

  await game.hydratePendingPicks();

  // First fill before serving; failures tolerated (lobby then shows ids only).
  await fixtureCatalog.refresh();
  fixtureCatalog.start();

  // Catch up on any picks locked while the worker was down, then batch on.
  await commitmentBatcher.runOnce();
  commitmentBatcher.start();

  // Keep the free-tier database awake through the judging window. Boot
  // already touched Supabase (hydratePendingPicks), so no immediate run.
  const heartbeat =
    persistence.describeBackend() === 'supabase'
      ? createSupabaseHeartbeat({ persistence })
      : null;
  heartbeat?.start();

  const abortController = new AbortController();

  const triggerResolution = (fixtureId: number): void => {
    game.resolveFixture(fixtureId).catch((cause: unknown) => {
      const messageText = cause instanceof Error ? cause.message : String(cause);
      console.error(`[triggerResolution] fixture ${fixtureId}: ${messageText}`);
    });
  };

  const ingestPromise = runIngest(
    env.cfg,
    sharedAuth,
    {
      onScoresUpdate: (update, receivedAtMs) => {
        const taped = appendTapeEntry(tapeDeck, update.FixtureId, {
          receivedAtMs,
          stream: 'scores',
          payload: update,
        });
        if (!taped.ok) {
          console.error(`[onScoresUpdate] ${taped.error}`);
        }
        recordLatency(scoresLatency, update.Ts, receivedAtMs);
        const state = applyScoresUpdate(store, update, receivedAtMs);
        triggerResolution(state.fixtureId);
        fanout.broadcast(state.fixtureId);
      },
      onOddsPayload: (payload, receivedAtMs) => {
        const taped = appendTapeEntry(tapeDeck, payload.FixtureId, {
          receivedAtMs,
          stream: 'odds',
          payload,
        });
        if (!taped.ok) {
          console.error(`[onOddsPayload] ${taped.error}`);
        }
        recordLatency(oddsLatency, payload.Ts, receivedAtMs);
        const state = applyOddsPayload(store, payload, receivedAtMs);
        triggerResolution(state.fixtureId);
        fanout.broadcast(state.fixtureId);
      },
      onHeartbeat: (stream, receivedAtMs) => {
        lastHeartbeatMs[stream] = receivedAtMs;
      },
    },
    abortController.signal,
  );

  fanout.server.listen(env.port, () => {
    console.log(
      `[main] worker up: network=${env.cfg.network} port=${env.port} tapes=${env.tapesDirectory}`,
    );
  });

  const shutdown = (signalName: string): void => {
    console.log(`[shutdown] ${signalName} received, stopping`);
    abortController.abort();
    commitmentBatcher.stop();
    heartbeat?.stop();
    replayManager.stopAll();
    fixtureCatalog.stop();
    fanout.close();
    void ingestPromise.then(() => {
      console.log('[shutdown] ingest stopped, bye');
    });
    // A lingering handle (an SSE socket mid-teardown) can keep the event
    // loop alive past the platform's grace period. Everything above already
    // stopped cleanly; exit 0 is honest after this bound. unref keeps the
    // timer itself from delaying an otherwise natural exit.
    const forceExitTimer = setTimeout(() => {
      console.log('[shutdown] bounded exit: a handle outlived the stop, exiting 0');
      process.exit(0);
    }, SHUTDOWN_GRACE_MS);
    forceExitTimer.unref();
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

void main();
