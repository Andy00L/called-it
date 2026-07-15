'use client';

import { useEffect, useState } from 'react';
import type { LivePayload, NearMissNotice, SettlementNotice } from '@calledit/contracts';
import { workerUrl } from './api';

export type LiveConnection = 'connecting' | 'open' | 'lost';

// Settlements kept in memory; a match settles far fewer picks per viewer.
const MAX_SETTLEMENTS_KEPT = 100;
const MAX_NEAR_MISSES_KEPT = 50;

export interface LiveMatchStream {
  payload: LivePayload | null;
  connection: LiveConnection;
  settlements: SettlementNotice[];
  nearMisses: NearMissNotice[];
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
  const [nearMisses, setNearMisses] = useState<NearMissNotice[]>([]);

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
    const handleNearMiss = (event: MessageEvent<string>): void => {
      try {
        const notice = JSON.parse(event.data) as NearMissNotice;
        setNearMisses((previous) => [...previous, notice].slice(-MAX_NEAR_MISSES_KEPT));
      } catch {
        console.error('[useWorkerStream] unparseable near-miss frame, skipping');
      }
    };
    const handleOpen = (): void => setConnection('open');
    const handleError = (): void => setConnection('lost');

    source.addEventListener('state', handleState);
    source.addEventListener('settlement', handleSettlement);
    source.addEventListener('near_miss', handleNearMiss);
    source.addEventListener('open', handleOpen);
    source.addEventListener('error', handleError);
    return () => {
      source.removeEventListener('state', handleState);
      source.removeEventListener('settlement', handleSettlement);
      source.removeEventListener('near_miss', handleNearMiss);
      source.close();
    };
  }, [channelPath]);

  return { payload, connection, settlements, nearMisses };
}

/**
 * Derived display clock: ticks locally between state frames while the match
 * clock runs. Replays compress time, so the local tick advances at the
 * session's speed multiplier (10x replay = 10 match seconds per real
 * second) instead of crawling at 1x between frames. useEffect is justified:
 * an interval timer is an external system with cleanup.
 */
export function useTickingClock(payload: LivePayload | null, speedMultiplier = 1): number {
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
      setDisplaySeconds(
        baseSeconds + Math.floor(((Date.now() - startedAtMs) * speedMultiplier) / 1000),
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [baseSeconds, running, speedMultiplier]);

  return displaySeconds;
}
