'use client';

import { useEffect, useState } from 'react';
import type { LivePayload, SettlementNotice } from '@calledit/contracts';
import { workerUrl } from './api';

export type LiveConnection = 'connecting' | 'open' | 'lost';

// Settlements kept in memory; a match settles far fewer picks per viewer.
const MAX_SETTLEMENTS_KEPT = 100;

export interface LiveMatchStream {
  payload: LivePayload | null;
  connection: LiveConnection;
  settlements: SettlementNotice[];
}

/**
 * Subscribe to the worker's per-fixture SSE channel. useEffect is justified
 * here: EventSource is a browser-owned external system needing explicit
 * lifecycle cleanup; EventSource reconnects on its own after errors.
 */
export function useLiveMatch(fixtureId: number): LiveMatchStream {
  const [payload, setPayload] = useState<LivePayload | null>(null);
  const [connection, setConnection] = useState<LiveConnection>('connecting');
  const [settlements, setSettlements] = useState<SettlementNotice[]>([]);

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
    const handleSettlement = (event: MessageEvent<string>): void => {
      try {
        const notice = JSON.parse(event.data) as SettlementNotice;
        setSettlements((previous) => [...previous, notice].slice(-MAX_SETTLEMENTS_KEPT));
      } catch {
        console.error('[useLiveMatch] unparseable settlement frame, skipping');
      }
    };
    const handleOpen = (): void => setConnection('open');
    const handleError = (): void => setConnection('lost');

    source.addEventListener('state', handleState);
    source.addEventListener('settlement', handleSettlement);
    source.addEventListener('open', handleOpen);
    source.addEventListener('error', handleError);
    return () => {
      source.removeEventListener('state', handleState);
      source.removeEventListener('settlement', handleSettlement);
      source.close();
    };
  }, [fixtureId]);

  return { payload, connection, settlements };
}
