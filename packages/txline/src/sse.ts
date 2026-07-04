import type { SseFrame, StreamMessage } from './types.js';

export interface SseOptions {
  headers: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * HTTP-level failure while opening a stream. Carries the status code so
 * long-lived consumers can react precisely (401 = re-acquire the guest JWT).
 */
export class StreamHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'StreamHttpError';
    this.status = status;
  }
}

/**
 * Minimal SSE client over fetch. Yields raw frames (id, event, data).
 * Node's fetch decompresses gzip transparently; we still advertise it.
 */
export async function* streamSse(url: string, options: SseOptions): AsyncGenerator<SseFrame> {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/event-stream',
      'Accept-Encoding': 'gzip',
      ...options.headers,
    },
    signal: options.signal ?? null,
  });
  if (!response.ok || response.body === null) {
    const body = await response.text().catch(() => '');
    throw new StreamHttpError(
      response.status,
      `SSE ${url} -> ${response.status}: ${body.slice(0, 300)}`,
    );
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let frame: Partial<SseFrame> & { dataLines: string[] } = { dataLines: [] };

  const flush = (): SseFrame | undefined => {
    if (frame.dataLines.length === 0 && frame.event === undefined && frame.id === undefined) {
      return undefined;
    }
    const out: SseFrame = { data: frame.dataLines.join('\n') };
    if (frame.id !== undefined) out.id = frame.id;
    if (frame.event !== undefined) out.event = frame.event;
    if (frame.retryMs !== undefined) out.retryMs = frame.retryMs;
    frame = { dataLines: [] };
    return out;
  };

  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, '');
      buffer = buffer.slice(newlineIndex + 1);
      newlineIndex = buffer.indexOf('\n');

      if (line === '') {
        const complete = flush();
        if (complete !== undefined) yield complete;
        continue;
      }
      if (line.startsWith(':')) continue;

      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      let fieldValue = colon === -1 ? '' : line.slice(colon + 1);
      if (fieldValue.startsWith(' ')) fieldValue = fieldValue.slice(1);

      if (field === 'data') frame.dataLines.push(fieldValue);
      else if (field === 'event') frame.event = fieldValue;
      else if (field === 'id') frame.id = fieldValue;
      else if (field === 'retry') {
        const parsed = Number.parseInt(fieldValue, 10);
        if (Number.isFinite(parsed)) frame.retryMs = parsed;
      }
    }
  }
  const complete = flush();
  if (complete !== undefined) yield complete;
}

/** Decode TxLINE stream frames into typed messages (heartbeats separated). */
export async function* streamJson<T>(
  url: string,
  options: SseOptions,
): AsyncGenerator<StreamMessage<T>> {
  for await (const frame of streamSse(url, options)) {
    if (frame.event === 'heartbeat') {
      try {
        const heartbeat = JSON.parse(frame.data) as { Ts?: number };
        yield { kind: 'heartbeat', ts: heartbeat.Ts ?? Date.now() };
      } catch {
        yield { kind: 'heartbeat', ts: Date.now() };
      }
      continue;
    }
    if (frame.data === '') continue;
    let payload: T;
    try {
      payload = JSON.parse(frame.data) as T;
    } catch {
      continue;
    }
    if (frame.id !== undefined) {
      yield { kind: 'data', id: frame.id, payload };
    } else {
      yield { kind: 'data', payload };
    }
  }
}
