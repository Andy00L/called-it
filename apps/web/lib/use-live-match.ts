'use client';

import { useEffect, useState } from 'react';
import type { LivePayload } from '@calledit/contracts';
import { workerUrl } from './api';

export type LiveConnection = 'connecting' | 'open' | 'lost';

export interface LiveMatch {
  payload: LivePayload | null;
  connection: LiveConnection;
}

/**
 * Subscribe to the worker's per-fixture SSE channel. useEffect is justified
 * here: EventSource is a browser-owned external system needing explicit
 * lifecycle cleanup; EventSource reconnects on its own after errors.
 */
export function useLiveMatch(fixtureId: number): LiveMatch {
  const [payload, setPayload] = useState<LivePayload | null>(null);
  const [connection, setConnection] = useState<LiveConnection>('connecting');

  useEffect(() => {
    const source = new EventSource(`${workerUrl()}/live/${fixtureId}`);

    const handleState = (event: MessageEvent<string>): void => {
      try {
        setPayload(JSON.parse(event.data) as LivePayload);
        setConnection('open');
      } catch {
        console.error('[useLiveMatch] unparseable state frame, skipping');
      }
    };
    const handleOpen = (): void => setConnection('open');
    const handleError = (): void => setConnection('lost');

    source.addEventListener('state', handleState);
    source.addEventListener('open', handleOpen);
    source.addEventListener('error', handleError);
    return () => {
      source.removeEventListener('state', handleState);
      source.close();
    };
  }, [fixtureId]);

  return { payload, connection };
}
