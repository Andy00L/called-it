'use client';

import { useEffect, useState } from 'react';
import type { GuestSession, TerraceStandingsPayload } from '@calledit/contracts';
import { ensureGuestSession, readStoredSession } from '../../lib/player';
import {
  createTerrace,
  fetchTerraceStandings,
  joinTerrace,
  TERRACE_FAILURE_COPY,
} from '../../lib/terrace-api';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Card, PaperPanel, Tray } from '../ui/surface';
import { Eyebrow } from '../ui/eyebrow';
import { Skeleton } from '../ui/skeleton';
import { formatPoints } from '../../lib/format';

// Copied confirmation dwell (sourceRef: components/receipt/receipt-actions.tsx).
const COPIED_RESET_MS = 1200;
// Member rows shown before the "+N more" line (the Bookie always shows).
const SHOWN_MEMBER_ROWS = 8;
// Seat cap, mirrored for display (sourceRef: apps/worker/src/game.ts
// TERRACE_MEMBER_LIMIT).
const TERRACE_SEAT_LIMIT = 40;

function normalizeCode(rawCode: string | null): string | null {
  if (rawCode === null) {
    return null;
  }
  const code = rawCode.trim().toUpperCase();
  return code === '' ? null : code;
}

/**
 * The terrace (group room) on the live match screen: no room yet shows the
 * invite card; with a room it renders the private per-match board with the
 * Bookie seated as the house rival, plus the /t/:code invite link.
 */
export function TerracePanel({
  fixtureId,
  initialCode,
  settlementCount,
}: {
  fixtureId: number;
  /** Room code carried on the match URL (?terrace=), or null. */
  initialCode: string | null;
  /** Settlements seen this session; a change refreshes the board. */
  settlementCount: number;
}) {
  const [activeCode, setActiveCode] = useState<string | null>(normalizeCode(initialCode));
  const [standings, setStandings] = useState<TerraceStandingsPayload | null>(null);
  const [boardError, setBoardError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [session, setSession] = useState<GuestSession | null>(null);

  // The stored identity marks "you" on the board; client-only localStorage.
  useEffect(() => {
    setSession(readStoredSession());
  }, []);

  // Board refresh: worker HTTP fetch (external system) with abort cleanup,
  // retriggered when a settlement lands (same pattern as MatchBoard).
  useEffect(() => {
    if (activeCode === null) {
      return;
    }
    const abortController = new AbortController();
    const load = async (): Promise<void> => {
      const fetched = await fetchTerraceStandings(activeCode);
      if (abortController.signal.aborted) {
        return;
      }
      if (!fetched.ok) {
        setBoardError(TERRACE_FAILURE_COPY[fetched.reason]);
        return;
      }
      setBoardError(null);
      setStandings(fetched.standings);
    };
    void load();
    return () => abortController.abort();
  }, [activeCode, settlementCount]);

  useEffect(() => {
    // External system: the one-shot reset timer for the copied confirmation.
    if (!isCopied) {
      return;
    }
    const timer = setTimeout(() => setIsCopied(false), COPIED_RESET_MS);
    return () => clearTimeout(timer);
  }, [isCopied]);

  const handleOpenTerrace = async (): Promise<void> => {
    setIsWorking(true);
    setActionError(null);
    const ensured = await ensureGuestSession();
    if (!ensured.ok) {
      setActionError(TERRACE_FAILURE_COPY[ensured.reason]);
      setIsWorking(false);
      return;
    }
    setSession(ensured.session);
    const created = await createTerrace(ensured.session, fixtureId);
    setIsWorking(false);
    if (!created.ok) {
      setActionError(TERRACE_FAILURE_COPY[created.reason]);
      return;
    }
    setStandings(created.standings);
    setActiveCode(created.standings.room.code);
    // Keep the room on the URL so a reload or a copied address returns to
    // this board; a query-only update needs no server round-trip.
    const params = new URLSearchParams(window.location.search);
    params.set('terrace', created.standings.room.code);
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  };

  const handleTakeSeat = async (): Promise<void> => {
    if (activeCode === null) {
      return;
    }
    setIsWorking(true);
    setActionError(null);
    const ensured = await ensureGuestSession();
    if (!ensured.ok) {
      setActionError(TERRACE_FAILURE_COPY[ensured.reason]);
      setIsWorking(false);
      return;
    }
    setSession(ensured.session);
    const joined = await joinTerrace(ensured.session, activeCode);
    setIsWorking(false);
    if (!joined.ok) {
      setActionError(TERRACE_FAILURE_COPY[joined.reason]);
      return;
    }
    setStandings(joined.standings);
  };

  const handleCopyInvite = async (): Promise<void> => {
    if (activeCode === null) {
      return;
    }
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/t/${activeCode}`);
      setIsCopied(true);
    } catch {
      // Clipboard denied (permissions): the code stays readable on screen.
    }
  };

  const memberEntries = standings?.entries.filter((entry) => !entry.isBookie) ?? [];
  const bookieEntry = standings?.entries.find((entry) => entry.isBookie) ?? null;
  const isViewerSeated =
    session !== null && memberEntries.some((entry) => entry.playerId === session.playerId);
  const hiddenMemberCount = Math.max(0, memberEntries.length - SHOWN_MEMBER_ROWS);

  return (
    <section aria-label="The terrace">
      <PaperPanel>
        <Tray className="p-2">
          <div className="mx-2.5 mb-2 mt-1.5 flex items-center justify-between gap-3">
            <Eyebrow>The terrace</Eyebrow>
            {standings !== null ? (
              <span className="tabular font-mono text-xs text-ink-muted">
                {standings.room.memberCount}/{TERRACE_SEAT_LIMIT} seats
              </span>
            ) : null}
          </div>

          {activeCode === null ? (
            <Card className="px-4 py-4">
              <p className="text-sm text-ink-muted">
                Watch with your group: one link, a private board for this match, and The Bookie
                seated as the rival to beat.
              </p>
              <div className="mt-3">
                <Button
                  variant="secondary"
                  isLoading={isWorking}
                  onClick={() => {
                    void handleOpenTerrace();
                  }}
                >
                  Open a terrace
                </Button>
              </div>
              {actionError !== null ? (
                <p role="alert" className="mt-2 text-xs text-miss">
                  {actionError}
                </p>
              ) : null}
            </Card>
          ) : standings === null ? (
            boardError !== null ? (
              <Card className="px-4 py-4">
                <p role="alert" className="text-sm text-miss">
                  {boardError}
                </p>
              </Card>
            ) : (
              <Card aria-busy className="p-1.5">
                {[0, 1, 2].map((row) => (
                  <div key={row} className={row === 0 ? '' : 'rule-dashed'}>
                    <div className="flex items-center gap-3 p-3">
                      <Skeleton className="h-3 w-4" />
                      <Skeleton className="h-3 flex-1" />
                      <Skeleton className="h-3 w-10" />
                    </div>
                  </div>
                ))}
              </Card>
            )
          ) : (
            <>
              <Card className="p-1.5">
                {memberEntries.slice(0, SHOWN_MEMBER_ROWS).map((entry, index) => {
                  const isYou = session !== null && entry.playerId === session.playerId;
                  return (
                    <div key={entry.playerId} className={index === 0 ? '' : 'rule-dashed'}>
                      <div
                        className={`flex items-center gap-3 rounded-chip p-3 ${
                          isYou ? 'bg-accent-soft' : ''
                        }`}
                      >
                        <span className="tabular w-4 font-mono text-xs text-ink-muted">
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                          {entry.handle}
                        </span>
                        {isYou ? <Badge tone="you">you</Badge> : null}
                        <span className="tabular font-mono text-sm font-semibold">
                          {formatPoints(entry.fixturePoints)}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {hiddenMemberCount > 0 ? (
                  <div className="rule-dashed">
                    <p className="p-3 text-xs text-ink-muted">
                      and {hiddenMemberCount} more on this terrace
                    </p>
                  </div>
                ) : null}
                {bookieEntry !== null ? (
                  <div className="rule-dashed pt-1.5">
                    <div className="flex items-center gap-3 rounded-chip bg-[var(--plate)] p-3 text-white">
                      <span aria-hidden className="w-4 text-center font-mono text-xs opacity-60">
                        &#183;
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {bookieEntry.handle}
                      </span>
                      <span className="tabular font-mono text-sm font-semibold">
                        {formatPoints(bookieEntry.fixturePoints)}
                      </span>
                    </div>
                  </div>
                ) : null}
              </Card>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 px-2.5 pb-1">
                <span className="tabular min-w-0 truncate font-mono text-xs text-ink-muted">
                  {standings.room.name.includes(activeCode)
                    ? standings.room.name
                    : `${standings.room.name} · ${activeCode}`}
                </span>
                <div className="flex flex-wrap gap-2">
                  {!isViewerSeated ? (
                    <Button
                      variant="secondary"
                      isLoading={isWorking}
                      onClick={() => {
                        void handleTakeSeat();
                      }}
                    >
                      Take a seat
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    onClick={() => {
                      void handleCopyInvite();
                    }}
                  >
                    {isCopied ? 'Copied' : 'Copy invite link'}
                  </Button>
                </div>
              </div>
              {actionError !== null ? (
                <p role="alert" className="px-2.5 pb-1 text-xs text-miss">
                  {actionError}
                </p>
              ) : null}
            </>
          )}
        </Tray>
      </PaperPanel>
    </section>
  );
}
