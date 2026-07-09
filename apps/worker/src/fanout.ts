import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { err, ok, type Result } from '@calledit/txline';

/**
 * Transport-only fan-out: JSON snapshots, one SSE channel per fixture, and a
 * thin JSON API surface delegated to the game layer. Payload composition and
 * game rules live in main.ts / game.ts; this module never inspects payloads.
 */

// SSE comment cadence; keeps idle sockets alive through proxies.
const KEEP_ALIVE_INTERVAL_MS = 15000;

// JSON body cap for POST requests; lock payloads are tiny (product choice).
const MAX_BODY_BYTES = 10000;

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

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  const text = JSON.stringify(body);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...CORS_HEADERS,
  });
  response.end(text);
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

  const openSseChannel = (
    request: IncomingMessage,
    response: ServerResponse,
    channelKey: string,
    initialPayload: unknown | null,
  ): void => {
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
    request.on('close', () => removeClient(channelKey, response));

    if (initialPayload !== null) {
      response.write(`event: state\ndata: ${JSON.stringify(initialPayload)}\n\n`);
    }
  };

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

    let body: unknown = undefined;
    if (method === 'POST') {
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
        openSseChannel(request, response, liveChannelKey(fixtureId), deps.buildLivePayload(fixtureId));
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
      openSseChannel(request, response, replayChannelKey(sessionId), deps.buildReplayPayload(sessionId));
      return;
    }
    sendJson(response, 404, {
      error:
        'unknown route; use /health, /fixtures, /state/:fixtureId, /live/:fixtureId, /leaderboard, /leaderboard/:fixtureId, /profile/:playerId, /receipts/:pickId, POST /players/guest, POST /picks, GET /replay/tapes, POST /replay/sessions, GET /replay/sessions/:sessionId/live',
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
    for (const clients of clientsByChannel.values()) {
      for (const client of clients) {
        client.write(': keep-alive\n\n');
      }
    }
  }, KEEP_ALIVE_INTERVAL_MS);

  const broadcastToChannel = (channelKey: string, eventName: string, payload: unknown): void => {
    const clients = clientsByChannel.get(channelKey);
    if (clients === undefined || clients.size === 0) {
      return;
    }
    const frame = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of clients) {
      client.write(frame);
    }
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

  const clientCount = (): number => {
    let total = 0;
    for (const clients of clientsByChannel.values()) {
      total += clients.size;
    }
    return total;
  };

  const close = (): void => {
    clearInterval(keepAliveTimer);
    for (const clients of clientsByChannel.values()) {
      for (const client of clients) {
        client.end();
      }
    }
    clientsByChannel.clear();
    server.close();
  };

  return {
    server,
    broadcast,
    broadcastEvent,
    broadcastReplay,
    broadcastReplayEvent,
    clientCount,
    close,
  };
}
