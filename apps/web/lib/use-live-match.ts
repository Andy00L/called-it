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
 * Subscribe to one of the worker's SSE channels (live fixture `/live/:id`
 * or replay session `/replay/sessions/:id/live`; both serve the same
 * state/settlement frames). useEffect is justified here: EventSource is a
 * browser-owned external system needing explicit lifecycle cleanup; it
 * reconnects on its own after errors.
 */
export function useWorkerStream(channelPath: string): LiveMatchStream {
  const [payload, setPayload] = useState<LivePayload | null>(null);
  const [connection, setConnection] = useState<LiveConnection>('connecting');
  const [settlements, setSettlements] = useState<SettlementNotice[]>([]);

  useEffect(() => {
    const source = new EventSource(`${workerUrl()}${channelPath}`);

    const handleState = (event: MessageEvent<string>): void => {
      try {
        setPayload(JSON.parse(event.data) as LivePayload);
        setConnection('open');
      } catch {
        console.error('[useWorkerStream] unparseable state frame, skipping');
      }
    };
    const handleSettlement = (event: MessageEvent<string>): void => {
      try {
        const notice = JSON.parse(event.data) as SettlementNotice;
        setSettlements((previous) => [...previous, notice].slice(-MAX_SETTLEMENTS_KEPT));
      } catch {
        console.error('[useWorkerStream] unparseable settlement frame, skipping');
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
  }, [channelPath]);

  return { payload, connection, settlements };
}

/**
 * Derived display clock: ticks locally between state frames while the match
 * clock runs. useEffect is justified: an interval timer is an external
 * system with cleanup.
 */
export function useTickingClock(payload: LivePayload | null): number {
  const baseSeconds = payload?.clockSeconds ?? 0;
  const running = payload?.clockRunning ?? false;
  const [displaySeconds, setDisplaySeconds] = useState(baseSeconds);

  useEffect(() => {
    setDisplaySeconds(baseSeconds);
    if (!running) {
      return;
    }
    const startedAtMs = Date.now();
    const timer = setInterval(() => {
      setDisplaySeconds(baseSeconds + Math.floor((Date.now() - startedAtMs) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [baseSeconds, running]);

  return displaySeconds;
}
