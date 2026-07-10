import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { err, ok, type Result } from '@calledit/txline';
import { createRateLimiter, type RateLimiter } from './rate-limit.js';

/**
 * Transport-only fan-out: JSON snapshots, one SSE channel per fixture, and a
 * thin JSON API surface delegated to the game layer. Payload composition and
 * game rules live in main.ts / game.ts; this module never inspects payloads.
 *
 * Abuse controls live here because this is the only public ingress: per-IP
 * rate limits on POST, per-IP and global caps on SSE connections, and slow
 * consumer eviction so a client that stops reading cannot grow the process
 * memory of a 24/7 worker.
 */

// SSE comment cadence; keeps idle sockets alive through proxies.
const KEEP_ALIVE_INTERVAL_MS = 15000;

// JSON body cap for POST requests; lock payloads are tiny (product choice).
const MAX_BODY_BYTES = 10000;

// Rate limits per client IP (product choice for a free-to-play MVP; no env).
// Guest creation writes a durable row on a free-tier database, so it is the
// stricter bucket; other actions (picks, handle, replay control) share a
// looser one that still blocks scripted floods.
const GUEST_CREATE_WINDOW_MS = 60_000;
const GUEST_CREATE_MAX = 12;
const ACTION_WINDOW_MS = 60_000;
const ACTION_MAX = 40;

// SSE connection caps: a global ceiling protects the small Railway box, a
// per-IP ceiling stops one client from hoarding the pool. A viewer needs at
// most a couple (a match tab plus a replay tab).
const MAX_SSE_CLIENTS_TOTAL = 400;
const MAX_SSE_CLIENTS_PER_IP = 8;

// A client whose outbound buffer passes this is not draining (dead tab, stalled
// network): drop it instead of letting the buffer grow. EventSource reconnects
// on its own, so a transient slow spell self-heals on the client side.
const MAX_SSE_CLIENT_BUFFER_BYTES = 512 * 1024;

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, x-player-id, x-player-token',
};

export interface ApiResult {
  status: number;
  body: unknown;
}

export interface FanoutDeps {
  buildLivePayload(fixtureId: number): unknown | null;
  buildStatePayload(fixtureId: number): unknown | null;
  buildHealthPayload(): unknown;
  /** Lobby listing: fixture metadata merged with live state summaries. */
  buildFixturesPayload(): unknown;
  /** Replay SSE support: session existence check plus the initial frame. */
  hasReplaySession(sessionId: string): boolean;
  buildReplayPayload(sessionId: string): unknown | null;
  /** Game API routes; returns null when the path is not an API route. */
  handleApiRequest(
    method: string,
    segments: string[],
    body: unknown,
    headers: IncomingMessage['headers'],
  ): Promise<ApiResult | null>;
}

export interface Fanout {
  server: Server;
  broadcast(fixtureId: number): void;
  broadcastEvent(fixtureId: number, eventName: string, payload: unknown): void;
  broadcastReplay(sessionId: string): void;
  broadcastReplayEvent(sessionId: string, eventName: string, payload: unknown): void;
  clientCount(): number;
  close(): void;
}

/** SSE channels are keyed by string: live matches and replay sessions share the plumbing. */
function liveChannelKey(fixtureId: number): string {
  return `live:${fixtureId}`;
}

function replayChannelKey(sessionId: string): string {
  return `replay:${sessionId}`;
}

/**
 * Client identity for rate limiting and connection caps. Railway terminates
 * TLS at a proxy, so the real client is the first hop of x-forwarded-for; the
 * socket address is the proxy otherwise. Not spoof-proof (an attacker can set
 * the header), but adequate abuse control for a public free game.
 */
function clientKeyOf(request: IncomingMessage): string {
  const forwarded = request.headers['x-forwarded-for'];
  const headerValue = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof headerValue === 'string') {
    const firstHop = headerValue.split(',')[0]?.trim();
    if (firstHop !== undefined && firstHop !== '') {
      return firstHop;
    }
  }
  return request.socket.remoteAddress ?? 'unknown';
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  const text = JSON.stringify(body);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...CORS_HEADERS,
  });
  response.end(text);
}

/** 429 with a Retry-After hint (seconds), distinct from other error shapes. */
function sendRateLimited(response: ServerResponse, retryAfterMs: number): void {
  response.writeHead(429, {
    'Content-Type': 'application/json; charset=utf-8',
    'Retry-After': String(Math.max(1, Math.ceil(retryAfterMs / 1000))),
    ...CORS_HEADERS,
  });
  response.end(JSON.stringify({ error: 'rate_limited' }));
}

/** Read a JSON request body with a hard size cap. */
function readJsonBody(request: IncomingMessage): Promise<Result<unknown, string>> {
  return new Promise((resolvePromise) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    request.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        request.removeAllListeners('data');
        request.removeAllListeners('end');
        // Stop absorbing the upload: the sender is over the cap already.
        request.destroy();
        resolvePromise(err('body_too_large'));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (raw === '') {
        resolvePromise(ok({}));
        return;
      }
      try {
        resolvePromise(ok(JSON.parse(raw) as unknown));
      } catch {
        resolvePromise(err('invalid_json'));
      }
    });
    request.on('error', () => resolvePromise(err('body_read_failed')));
  });
}

export function createFanout(deps: FanoutDeps): Fanout {
  const clientsByChannel = new Map<string, Set<ServerResponse>>();
  // SSE accounting for the connection caps, kept O(1) alongside the channel map.
  const sseCountByIp = new Map<string, number>();
  let totalSseClients = 0;

  const guestRateLimiter: RateLimiter = createRateLimiter({
    windowMs: GUEST_CREATE_WINDOW_MS,
    maxRequests: GUEST_CREATE_MAX,
  });
  const actionRateLimiter: RateLimiter = createRateLimiter({
    windowMs: ACTION_WINDOW_MS,
    maxRequests: ACTION_MAX,
  });

  const removeClient = (channelKey: string, response: ServerResponse): void => {
    const clients = clientsByChannel.get(channelKey);
    if (clients === undefined) {
      return;
    }
    clients.delete(response);
    if (clients.size === 0) {
      clientsByChannel.delete(channelKey);
    }
  };

  const releaseSseSlot = (clientKey: string): void => {
    totalSseClients = Math.max(0, totalSseClients - 1);
    const current = sseCountByIp.get(clientKey);
    if (current === undefined) {
      return;
    }
    if (current <= 1) {
      sseCountByIp.delete(clientKey);
    } else {
      sseCountByIp.set(clientKey, current - 1);
    }
  };

  const dropSlowClient = (channelKey: string, client: ServerResponse): void => {
    // Remove from the channel first so no further frame is written this tick;
    // the request 'close' handler releases the SSE slot when the socket dies.
    removeClient(channelKey, client);
    client.destroy();
  };

  /** Write one frame to a channel, evicting clients that stopped draining. */
  const writeFrame = (channelKey: string, clients: Set<ServerResponse>, frame: string): void => {
    const slowClients: ServerResponse[] = [];
    for (const client of clients) {
      if (client.writableEnded) {
        slowClients.push(client);
        continue;
      }
      client.write(frame);
      if (client.writableLength > MAX_SSE_CLIENT_BUFFER_BYTES) {
        slowClients.push(client);
      }
    }
    for (const client of slowClients) {
      dropSlowClient(channelKey, client);
    }
  };

  const openSseChannel = (
    request: IncomingMessage,
    response: ServerResponse,
    channelKey: string,
    clientKey: string,
    initialPayload: unknown | null,
  ): void => {
    if (totalSseClients >= MAX_SSE_CLIENTS_TOTAL) {
      sendJson(response, 503, { error: 'sse_capacity' });
      return;
    }
    const perIpCount = sseCountByIp.get(clientKey) ?? 0;
    if (perIpCount >= MAX_SSE_CLIENTS_PER_IP) {
      sendJson(response, 429, { error: 'sse_too_many_connections' });
      return;
    }

    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      ...CORS_HEADERS,
    });
    response.write(': connected\n\n');

    const clients = clientsByChannel.get(channelKey) ?? new Set<ServerResponse>();
    clients.add(response);
    clientsByChannel.set(channelKey, clients);
    totalSseClients += 1;
    sseCountByIp.set(clientKey, perIpCount + 1);
    let released = false;
    request.on('close', () => {
      removeClient(channelKey, response);
      // Guard against a double release if the socket emits close twice.
      if (!released) {
        released = true;
        releaseSseSlot(clientKey);
      }
    });

    if (initialPayload !== null) {
      response.write(`event: state\ndata: ${JSON.stringify(initialPayload)}\n\n`);
    }
  };

  /** Bucket a POST by cost; guest creation is the strict one. */
  const rateLimiterForPost = (segments: string[]): RateLimiter =>
    segments[0] === 'players' && segments[1] === 'guest' ? guestRateLimiter : actionRateLimiter;

  const routeRequest = async (
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> => {
    const method = request.method ?? 'GET';
    if (method === 'OPTIONS') {
      response.writeHead(204, CORS_HEADERS);
      response.end();
      return;
    }
    if (method !== 'GET' && method !== 'POST') {
      sendJson(response, 405, { error: 'method not allowed; use GET or POST' });
      return;
    }

    const requestUrl = new URL(request.url ?? '/', 'http://fanout.local');
    const segments = requestUrl.pathname.split('/').filter((segment) => segment !== '');
    const clientKey = clientKeyOf(request);

    let body: unknown = undefined;
    if (method === 'POST') {
      // Rate-limit before reading the body, so a flood is rejected cheaply.
      const decision = rateLimiterForPost(segments).check(clientKey);
      if (!decision.allowed) {
        sendRateLimited(response, decision.retryAfterMs);
        return;
      }
      const bodyResult = await readJsonBody(request);
      if (!bodyResult.ok) {
        sendJson(response, bodyResult.error === 'body_too_large' ? 413 : 400, {
          error: bodyResult.error,
        });
        return;
      }
      body = bodyResult.value;
    }

    const apiResult = await deps.handleApiRequest(method, segments, body, request.headers);
    if (apiResult !== null) {
      sendJson(response, apiResult.status, apiResult.body);
      return;
    }

    if (method === 'GET' && segments.length === 1 && segments[0] === 'health') {
      sendJson(response, 200, deps.buildHealthPayload());
      return;
    }
    if (method === 'GET' && segments.length === 1 && segments[0] === 'fixtures') {
      sendJson(response, 200, deps.buildFixturesPayload());
      return;
    }
    if (
      method === 'GET' &&
      segments.length === 2 &&
      (segments[0] === 'state' || segments[0] === 'live')
    ) {
      const fixtureId = Number.parseInt(segments[1] ?? '', 10);
      if (!Number.isInteger(fixtureId) || fixtureId <= 0) {
        sendJson(response, 400, { error: 'fixtureId must be a positive integer' });
        return;
      }
      if (segments[0] === 'live') {
        openSseChannel(
          request,
          response,
          liveChannelKey(fixtureId),
          clientKey,
          deps.buildLivePayload(fixtureId),
        );
        return;
      }
      const statePayload = deps.buildStatePayload(fixtureId);
      if (statePayload === null) {
        sendJson(response, 404, { error: `no state yet for fixture ${fixtureId}` });
        return;
      }
      sendJson(response, 200, statePayload);
      return;
    }
    // Replay SSE: /replay/sessions/:sessionId/live. JSON replay routes go
    // through handleApiRequest above; only the stream lives here.
    if (
      method === 'GET' &&
      segments.length === 4 &&
      segments[0] === 'replay' &&
      segments[1] === 'sessions' &&
      segments[3] === 'live'
    ) {
      const sessionId = segments[2] ?? '';
      if (!deps.hasReplaySession(sessionId)) {
        sendJson(response, 404, { error: 'unknown_session' });
        return;
      }
      openSseChannel(
        request,
        response,
        replayChannelKey(sessionId),
        clientKey,
        deps.buildReplayPayload(sessionId),
      );
      return;
    }
    sendJson(response, 404, {
      error:
        'unknown route; use /health, /fixtures, /state/:fixtureId, /live/:fixtureId, /leaderboard, /leaderboard/:fixtureId, /profile/:playerId, /receipts/:pickId, POST /players/guest, POST /players/handle, POST /picks, GET /replay/tapes, POST /replay/sessions, GET /replay/sessions/:sessionId/live',
    });
  };

  const server = createServer((request, response) => {
    routeRequest(request, response).catch((cause: unknown) => {
      const messageText = cause instanceof Error ? cause.message : String(cause);
      console.error(`[routeRequest] unhandled: ${messageText}`);
      if (!response.headersSent) {
        sendJson(response, 500, { error: 'internal' });
      }
    });
  });

  const keepAliveTimer = setInterval(() => {
    for (const [channelKey, clients] of clientsByChannel) {
      writeFrame(channelKey, clients, ': keep-alive\n\n');
    }
  }, KEEP_ALIVE_INTERVAL_MS);

  const broadcastToChannel = (channelKey: string, eventName: string, payload: unknown): void => {
    const clients = clientsByChannel.get(channelKey);
    if (clients === undefined || clients.size === 0) {
      return;
    }
    const frame = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
    writeFrame(channelKey, clients, frame);
  };

  const broadcastEvent = (fixtureId: number, eventName: string, payload: unknown): void => {
    broadcastToChannel(liveChannelKey(fixtureId), eventName, payload);
  };

  const broadcast = (fixtureId: number): void => {
    const payload = deps.buildLivePayload(fixtureId);
    if (payload === null) {
      return;
    }
    broadcastEvent(fixtureId, 'state', payload);
  };

  const broadcastReplayEvent = (sessionId: string, eventName: string, payload: unknown): void => {
    broadcastToChannel(replayChannelKey(sessionId), eventName, payload);
  };

  const broadcastReplay = (sessionId: string): void => {
    const payload = deps.buildReplayPayload(sessionId);
    if (payload === null) {
      return;
    }
    broadcastReplayEvent(sessionId, 'state', payload);
  };

  const close = (): void => {
    clearInterval(keepAliveTimer);
    for (const clients of clientsByChannel.values()) {
      for (const client of clients) {
        client.end();
      }
    }
    clientsByChannel.clear();
    sseCountByIp.clear();
    totalSseClients = 0;
    server.close();
  };

  return {
    server,
    broadcast,
    broadcastEvent,
    broadcastReplay,
    broadcastReplayEvent,
    clientCount: () => totalSseClients,
    close,
  };
}
