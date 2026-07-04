import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

/**
 * Transport-only fan-out: JSON snapshots plus one SSE channel per fixture.
 * Payload composition lives in main.ts; this module never inspects payloads.
 */

// SSE comment cadence; keeps idle sockets alive through proxies.
const KEEP_ALIVE_INTERVAL_MS = 15000;

export interface FanoutDeps {
  buildLivePayload(fixtureId: number): unknown | null;
  buildStatePayload(fixtureId: number): unknown | null;
  buildHealthPayload(): unknown;
}

export interface Fanout {
  server: Server;
  broadcast(fixtureId: number): void;
  clientCount(): number;
  close(): void;
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  const text = JSON.stringify(body);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  response.end(text);
}

export function createFanout(deps: FanoutDeps): Fanout {
  const clientsByFixture = new Map<number, Set<ServerResponse>>();

  const removeClient = (fixtureId: number, response: ServerResponse): void => {
    const clients = clientsByFixture.get(fixtureId);
    if (clients === undefined) {
      return;
    }
    clients.delete(response);
    if (clients.size === 0) {
      clientsByFixture.delete(fixtureId);
    }
  };

  const openLiveChannel = (
    request: IncomingMessage,
    response: ServerResponse,
    fixtureId: number,
  ): void => {
    response.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    response.write(': connected\n\n');

    const clients = clientsByFixture.get(fixtureId) ?? new Set<ServerResponse>();
    clients.add(response);
    clientsByFixture.set(fixtureId, clients);
    request.on('close', () => removeClient(fixtureId, response));

    const initialPayload = deps.buildLivePayload(fixtureId);
    if (initialPayload !== null) {
      response.write(`event: state\ndata: ${JSON.stringify(initialPayload)}\n\n`);
    }
  };

  const handleRequest = (request: IncomingMessage, response: ServerResponse): void => {
    if (request.method !== 'GET') {
      sendJson(response, 405, { error: 'method not allowed; this API is read-only GET' });
      return;
    }
    const requestUrl = new URL(request.url ?? '/', 'http://fanout.local');
    const segments = requestUrl.pathname.split('/').filter((segment) => segment !== '');

    if (segments.length === 1 && segments[0] === 'health') {
      sendJson(response, 200, deps.buildHealthPayload());
      return;
    }
    if (segments.length === 2 && (segments[0] === 'state' || segments[0] === 'live')) {
      const fixtureId = Number.parseInt(segments[1] ?? '', 10);
      if (!Number.isInteger(fixtureId) || fixtureId <= 0) {
        sendJson(response, 400, { error: 'fixtureId must be a positive integer' });
        return;
      }
      if (segments[0] === 'live') {
        openLiveChannel(request, response, fixtureId);
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
    sendJson(response, 404, { error: 'unknown route; use /health, /state/:fixtureId, /live/:fixtureId' });
  };

  const server = createServer(handleRequest);

  const keepAliveTimer = setInterval(() => {
    for (const clients of clientsByFixture.values()) {
      for (const client of clients) {
        client.write(': keep-alive\n\n');
      }
    }
  }, KEEP_ALIVE_INTERVAL_MS);

  const broadcast = (fixtureId: number): void => {
    const clients = clientsByFixture.get(fixtureId);
    if (clients === undefined || clients.size === 0) {
      return;
    }
    const payload = deps.buildLivePayload(fixtureId);
    if (payload === null) {
      return;
    }
    const frame = `event: state\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of clients) {
      client.write(frame);
    }
  };

  const clientCount = (): number => {
    let total = 0;
    for (const clients of clientsByFixture.values()) {
      total += clients.size;
    }
    return total;
  };

  const close = (): void => {
    clearInterval(keepAliveTimer);
    for (const clients of clientsByFixture.values()) {
      for (const client of clients) {
        client.end();
      }
    }
    clientsByFixture.clear();
    server.close();
  };

  return { server, broadcast, clientCount, close };
}
