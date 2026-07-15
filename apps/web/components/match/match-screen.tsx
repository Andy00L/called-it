'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type {
  CallCategory,
  CallOption,
  GuestSession,
  MyPickEntry,
  PickRecord,
  SettlementNotice,
} from '@calledit/contracts';
import { useTickingClock, useWorkerStream } from '../../lib/use-live-match';
import { ensureGuestSession, clearStoredSession, readStoredSession } from '../../lib/player';
import { fetchMyPicks, lockPick, LOCK_FAILURE_COPY } from '../../lib/game-api';
import {
  fetchReplayPicks,
  lockReplayPick,
  setReplaySpeed,
  REPLAY_FAILURE_COPY,
} from '../../lib/replay-api';
import { armPrintFeedback } from '../../lib/print-feedback';
import { Skeleton } from '../ui/skeleton';
import { EmptyState } from '../ui/empty-state';
import { Eyebrow } from '../ui/eyebrow';
import { Card, PaperPanel, Tray } from '../ui/surface';
import { BroadcastTopBar } from '../ui/broadcast-shell';
import { buttonClassName } from '../ui/button-styles';
import { MatchCockpit } from './match-cockpit';
import { CallCard } from './call-card';
import { LatencyHud } from './latency-hud';
import { EventFeed } from './event-feed';
import { BookieCard } from './bookie-card';
import { MatchBoard } from './match-board';
import { ReplayRibbon } from './replay-ribbon';
import { SettlementLayer } from './settlement-layer';
import { NearMissLayer } from './near-miss-layer';
import { HalfTimeReport } from './half-time-report';
import { TerracePanel } from '../terrace/terrace-panel';
import { FinalEditionCard, type SettledRow } from './final-edition';
import { HowItWorks } from '../onboarding/how-it-works';
import { formatClockMinutes } from '../../lib/format';
import { SPONSORED_CATEGORY } from '../../lib/sponsor';

// Punch + ring flash length on a fresh lock (sheet motion tokens).
const JUST_LOCKED_MS = 500;

export type MatchScreenMode =
  | { kind: 'live'; fixtureId: number }
  | { kind: 'replay'; sessionId: string; fixtureId: number; initialSpeed: number };

interface LockedEntry {
  pick: PickRecord;
  bookieProbability: number | null;
}

function ReconnectingBanner() {
  return (
    <div
      role="status"
      className="flex items-center gap-2.5 rounded-chip bg-[var(--plate)] px-3.5 py-2.5 text-white"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        aria-hidden
        className="animate-[spin-once_900ms_linear_infinite]"
      >
        <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.6" />
        <path
          d="M7 1.5A5.5 5.5 0 0 1 12.5 7"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
      <span className="text-[13px]">Reconnecting to the live feed</span>
    </div>
  );
}

function LoadingLayout() {
  // Mirrors the final layout (sheet rule): the cockpit card (score, pulse,
  // pitch, sponsor) on the left, the calls deck on the right.
  return (
    <div aria-busy className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3 py-3">
        <Skeleton className="size-11" />
        <Skeleton className="h-2.5 w-36" />
        <Skeleton className="h-6 w-16" />
      </div>
      <div className="flex flex-wrap items-start gap-5">
        <div className="min-w-0 flex-[1_1_430px]">
          <PaperPanel>
          <Tray className="p-2">
            <Card className="p-5">
              <div className="flex items-center justify-center gap-3.5">
                <Skeleton className="h-4.5 w-22" />
                <Skeleton className="h-6.5 w-14" />
                <Skeleton className="h-4.5 w-22" />
              </div>
              <div className="mt-2.5 flex justify-center">
                <Skeleton className="h-3 w-24" />
              </div>
              <div className="rule-dashed mb-3 mt-4" />
              <Skeleton className="h-2 w-full rounded-[6px]" />
              <div className="mt-2.5 flex justify-center">
                <Skeleton className="h-2.5 w-50" />
              </div>
              <div className="rule-dashed mb-3 mt-4" />
              <Skeleton tone="deep" className="aspect-[340/200] w-full rounded-[6px]" />
              <div className="rule-dashed mt-3 pt-3">
                <div className="flex justify-center">
                  <Skeleton className="h-2.5 w-44" />
                </div>
              </div>
            </Card>
          </Tray>
          </PaperPanel>
        </div>
        <div className="min-w-0 flex-[1_1_360px]">
          <PaperPanel>
          <Tray className="p-2">
            <div className="mx-2.5 mb-2 mt-1">
              <Skeleton tone="deep" className="h-2 w-19" />
            </div>
            <Card>
              {[0, 1, 2].map((row) => (
                <div
                  key={row}
                  className={`flex justify-between gap-4 p-4 ${row === 0 ? '' : 'rule-dashed'}`}
                >
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-2 w-13" />
                    <Skeleton className="h-3.5 w-45" />
                    <Skeleton className="h-2.5 w-27" />
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Skeleton className="h-4.5 w-12" />
                    <Skeleton className="h-9.5 w-21 rounded-none" />
                  </div>
                </div>
              ))}
            </Card>
          </Tray>
          </PaperPanel>
        </div>
      </div>
    </div>
  );
}

export function MatchScreen({
  mode,
  participant1,
  participant2,
  competition,
  startTimeMs,
  sponsorName,
  terraceCode = null,
}: {
  mode: MatchScreenMode;
  participant1: string;
  participant2: string;
  competition: string;
  startTimeMs: number;
  /** Resolved match sponsor (the ?sponsor= demo); rides all three surfaces. */
  sponsorName: string;
  /** Group room code from ?terrace=; null renders the invite card instead. */
  terraceCode?: string | null;
}) {
  const channelPath =
    mode.kind === 'live' ? `/live/${mode.fixtureId}` : `/replay/sessions/${mode.sessionId}/live`;
  const { payload, connection, settlements, nearMisses } = useWorkerStream(channelPath);

  const [session, setSession] = useState<GuestSession | null>(null);
  // Keyed by category, not option id: window options regenerate ids as the
  // clock advances, while the game allows one live call per category
  // (sourceRef: apps/worker/src/game.ts duplicate_category).
  const [lockedByCategory, setLockedByCategory] = useState<Map<CallCategory, LockedEntry>>(
    new Map(),
  );
  const [lockingCategory, setLockingCategory] = useState<CallCategory | null>(null);
  const [lockErrors, setLockErrors] = useState<Map<CallCategory, string>>(new Map());
  const [justLockedCategory, setJustLockedCategory] = useState<CallCategory | null>(null);
  const [speed, setSpeed] = useState(mode.kind === 'replay' ? mode.initialSpeed : 1);
  const [replayNotice, setReplayNotice] = useState<string | null>(null);
  // Replays compress time, so the between-frames tick runs at session speed.
  const displayClockSeconds = useTickingClock(payload, mode.kind === 'replay' ? speed : 1);
  // The pitch is big by default; the viewer can reduce it to reach the calls.
  const [pitchReduced, setPitchReduced] = useState(false);
  // The call deck folds to a narrow rail so the pitch takes the width
  // (accepted broadcast match export); live phase only.
  const [callsCollapsed, setCallsCollapsed] = useState(false);

  // The stored identity marks "you" on the board without forcing a lock.
  useEffect(() => {
    setSession(readStoredSession());
  }, []);

  // The picks a reload wiped from memory, restored from the worker (they were
  // never gone server-side). Pending ones re-seed the lock state; settled
  // ones re-enter the list and the points (external system: worker HTTP).
  // Keyed on connection too: the SSE channel replays NO backlog, so a pick
  // that settled while the tab was disconnected (phone slept, wifi dropped)
  // only ever reaches this client through a re-fetch on the reconnect.
  const [restoredEntries, setRestoredEntries] = useState<MyPickEntry[]>([]);
  useEffect(() => {
    const abortController = new AbortController();
    const restorePicks = async (): Promise<void> => {
      const fetched =
        mode.kind === 'replay'
          ? await fetchReplayPicks(mode.sessionId)
          : session !== null
            ? await fetchMyPicks(session, mode.fixtureId)
            : null;
      if (fetched === null || !fetched.ok || abortController.signal.aborted) {
        return;
      }
      setRestoredEntries(fetched.entries);
      setLockedByCategory((previous) => {
        const next = new Map(previous);
        for (const entry of fetched.entries) {
          if (entry.settlement === null && !next.has(entry.pick.category)) {
            next.set(entry.pick.category, {
              pick: entry.pick,
              bookieProbability: entry.bookieProbability,
            });
          }
        }
        return next;
      });
    };
    void restorePicks();
    return () => abortController.abort();
  }, [mode, session, connection]);

  useEffect(() => {
    if (justLockedCategory === null) {
      return;
    }
    const timer = setTimeout(() => setJustLockedCategory(null), JUST_LOCKED_MS);
    return () => clearTimeout(timer);
  }, [justLockedCategory]);

  const failLock = (category: CallCategory, message: string): void => {
    setLockErrors((previous) => new Map(previous).set(category, message));
    setLockingCategory(null);
  };

  const recordLock = (category: CallCategory, entry: LockedEntry): void => {
    setLockedByCategory((previous) => new Map(previous).set(category, entry));
    setLockingCategory(null);
    setJustLockedCategory(category);
  };

  const handleLock = async (option: CallOption): Promise<void> => {
    // The lock interaction is the user gesture that unlocks the receipt's
    // print sound later (settlements arrive over SSE, never as gestures).
    armPrintFeedback();
    setLockingCategory(option.category);
    setLockErrors((previous) => {
      const next = new Map(previous);
      next.delete(option.category);
      return next;
    });

    if (mode.kind === 'replay') {
      const locked = await lockReplayPick(mode.sessionId, option.id);
      if (!locked.ok) {
        failLock(option.category, REPLAY_FAILURE_COPY[locked.reason]);
        return;
      }
      recordLock(option.category, {
        pick: locked.result.pick,
        bookieProbability: locked.result.bookiePick?.probabilityFraction ?? null,
      });
      return;
    }

    const ensured = await ensureGuestSession();
    if (!ensured.ok) {
      failLock(option.category, LOCK_FAILURE_COPY[ensured.reason]);
      return;
    }
    setSession(ensured.session);

    let outcome = await lockPick(ensured.session, mode.fixtureId, option.id);
    if (!outcome.ok && outcome.reason === 'auth_failed') {
      // Stored identity no longer valid (wiped server data): start fresh once.
      clearStoredSession();
      const fresh = await ensureGuestSession();
      if (fresh.ok) {
        setSession(fresh.session);
        outcome = await lockPick(fresh.session, mode.fixtureId, option.id);
      }
    }
    if (!outcome.ok) {
      failLock(option.category, LOCK_FAILURE_COPY[outcome.reason]);
      return;
    }
    recordLock(option.category, {
      pick: outcome.result.pick,
      bookieProbability: outcome.result.bookiePick?.probabilityFraction ?? null,
    });
  };

  const handleSpeed = async (nextSpeed: number): Promise<void> => {
    if (mode.kind !== 'replay' || nextSpeed === speed) {
      return;
    }
    const previousSpeed = speed;
    setSpeed(nextSpeed);
    setReplayNotice(null);
    const updated = await setReplaySpeed(mode.sessionId, nextSpeed);
    if (!updated.ok) {
      setSpeed(previousSpeed);
      setReplayNotice(REPLAY_FAILURE_COPY[updated.reason]);
    }
  };

  const togglePitch = (): void => setPitchReduced((previous) => !previous);

  if (payload === null && connection !== 'lost') {
    return <LoadingLayout />;
  }
  if (payload === null) {
    return (
      <div className="mt-6">
        <PaperPanel>
          <div className="p-2">
            <EmptyState
              motif="error"
              title="The feed dropped"
              action={
                <Link href="/" className={buttonClassName('primary')}>
                  Back to the lobby
                </Link>
              }
            />
          </div>
        </PaperPanel>
      </div>
    );
  }

  // Mine = my locked picks (live) or every human pick (replay is private).
  const isMine = (notice: SettlementNotice): boolean =>
    mode.kind === 'replay'
      ? !notice.pick.isBookie
      : [...lockedByCategory.values()].some((entry) => entry.pick.id === notice.pick.id) ||
        restoredEntries.some((entry) => entry.pick.id === notice.pick.id);
  const mySettlements = settlements.filter(isMine);
  const nearMissByPickId = new Map(
    nearMisses.map((notice) => [
      notice.pickId,
      notice.eventClockSeconds - notice.windowEndClockSeconds,
    ]),
  );
  const sseRows: SettledRow[] = mySettlements.map((notice) => ({
    pick: notice.pick,
    outcome: notice.outcome,
    pointsAwarded: notice.pointsAwarded,
    nearMissSeconds: nearMissByPickId.get(notice.pick.id) ?? null,
  }));
  const sseRowIds = new Set(sseRows.map((row) => row.pick.id));
  // Reload-restored settlements lead (they happened earlier), deduped against
  // anything the live stream already delivered this session.
  const settledRows: SettledRow[] = [
    ...restoredEntries.flatMap((entry) =>
      entry.settlement === null || sseRowIds.has(entry.pick.id)
        ? []
        : [
            {
              pick: entry.pick,
              outcome: entry.settlement.outcome,
              pointsAwarded: entry.settlement.pointsAwarded,
              nearMissSeconds:
                nearMissByPickId.get(entry.pick.id) ?? entry.settlement.nearMissSeconds,
            },
          ],
    ),
    ...sseRows,
  ];
  const settledPickIds = new Set(settledRows.map((row) => row.pick.id));
  const pendingMine = [...lockedByCategory.values()].filter(
    (entry) => !settledPickIds.has(entry.pick.id),
  );
  // A category frees up again once its pick settles.
  const pendingLockFor = (category: CallCategory): LockedEntry | undefined => {
    const entry = lockedByCategory.get(category);
    return entry !== undefined && !settledPickIds.has(entry.pick.id) ? entry : undefined;
  };
  const sessionPoints = settledRows.reduce((sum, row) => sum + row.pointsAwarded, 0);
  const lastBookieProbability =
    [...lockedByCategory.values()].map((entry) => entry.bookieProbability).at(-1) ?? null;
  const fixtureLine = `${participant1} vs ${participant2} (${competition})`;
  // Peak-end (Kahneman): the best hit leads the final edition and carries
  // the share action, so every session ends on its peak.
  const bestRow = settledRows
    .filter((row) => row.outcome === 'hit')
    .reduce<SettledRow | undefined>(
      (best, row) => (best === undefined || row.pointsAwarded > best.pointsAwarded ? row : best),
      undefined,
    );
  const finalEditionRows =
    bestRow === undefined
      ? settledRows
      : [bestRow, ...settledRows.filter((row) => row.pick.id !== bestRow.pick.id)];
  // First-visit nudge (the HIG playable-tutorial idea): mark the likeliest
  // call, never pre-pick it. A guest session only exists after a first lock,
  // so its absence IS the first-visit signal; the marker dies at that lock.
  const suggestedOptionId =
    session === null && lockedByCategory.size === 0 && payload.phase === 'live'
      ? (payload.catalog.reduce<CallOption | null>(
          (best, option) =>
            best === null || option.probabilityFraction > best.probabilityFraction
              ? option
              : best,
          null,
        )?.id ?? null)
      : null;
  const myNearMisses = nearMisses.filter(
    (notice) => mode.kind === 'replay' || settledPickIds.has(notice.pickId),
  );
  // The Bookie mirrors every human pick (bookieOfPickId); its settlements
  // ride the same channel, so the half-time duel line tallies the mirrors of
  // MY picks. Replays are private: every mirror on the channel is mine.
  const myPickIds = new Set([
    ...[...lockedByCategory.values()].map((entry) => entry.pick.id),
    ...restoredEntries.map((entry) => entry.pick.id),
  ]);
  const bookieMirrorNotices = settlements.filter(
    (notice) =>
      notice.pick.isBookie &&
      (mode.kind === 'replay' ||
        (notice.pick.bookieOfPickId !== null && myPickIds.has(notice.pick.bookieOfPickId))),
  );
  const bookieHalfTally = {
    settled: bookieMirrorNotices.length,
    hits: bookieMirrorNotices.filter((notice) => notice.outcome === 'hit').length,
  };
  const scoreLine = `${participant1} ${payload.goalsP1}-${payload.goalsP2} ${participant2}`;

  const callsSection =
    payload.phase === 'pre' ? (
      <Tray className="p-2">
        <div className="mx-2.5 mb-2 mt-1.5 flex">
          <Eyebrow>Open calls</Eyebrow>
        </div>
        <EmptyState
          motif="flag"
          title="Calls open at kickoff"
          action={
            <Link href="/" className={buttonClassName('ghost')}>
              See other live matches
            </Link>
          }
        />
      </Tray>
    ) : payload.phase === 'finished' ? (
      settledRows.length > 0 ? (
        <FinalEditionCard
          rows={finalEditionRows}
          bestPickId={bestRow?.pick.id ?? null}
          sessionPoints={sessionPoints}
          withReceiptLinks={mode.kind === 'live'}
        />
      ) : (
        <Tray className="p-2">
          <div className="mx-2.5 mb-2 mt-1.5 flex">
            <Eyebrow>Open calls</Eyebrow>
          </div>
          <EmptyState
            motif="ball"
            title="Full time. This match has settled."
            action={
              <Link href="/" className={buttonClassName('ghost')}>
                See other matches
              </Link>
            }
          />
        </Tray>
      )
    ) : (
      <Tray className="p-2">
        <div className="mx-2.5 mb-2 mt-1.5 flex items-center justify-between gap-3">
          <Eyebrow>Open calls</Eyebrow>
          <button
            type="button"
            onClick={() => setCallsCollapsed(true)}
            aria-expanded
            aria-label="Collapse open calls"
            className="inline-flex size-8 items-center justify-center rounded-chip border border-hairline bg-card text-sm text-ink-muted transition-transform duration-[var(--duration-micro)] ease-[var(--ease-standard)] hover:text-ink active:scale-[0.94] max-sm:hidden"
          >
            <span aria-hidden>&#187;</span>
          </button>
        </div>
        {payload.catalog.length === 0 ? (
          <EmptyState motif="flag" title="Calls regenerate while the clock runs" />
        ) : (
          <Card className="overflow-hidden">
            {payload.catalog.map((option, index) => {
              const pendingLock = pendingLockFor(option.category);
              return (
                <div key={option.category} className={index === 0 ? '' : 'rule-dashed'}>
                  <CallCard
                    option={option}
                    clockSeconds={displayClockSeconds}
                    locked={
                      pendingLock !== undefined
                        ? { lockClockSeconds: pendingLock.pick.lockClockSeconds }
                        : undefined
                    }
                    isLocking={lockingCategory === option.category}
                    lockError={lockErrors.get(option.category)}
                    justLocked={justLockedCategory === option.category}
                    enterDelayMs={index * 40}
                    sponsor={option.category === SPONSORED_CATEGORY ? sponsorName : undefined}
                    isSuggested={option.id === suggestedOptionId}
                    onLock={(picked) => {
                      void handleLock(picked);
                    }}
                  />
                </div>
              );
            })}
          </Card>
        )}
      </Tray>
    );

  return (
    <div>
      {mode.kind === 'replay' ? (
        <>
          <ReplayRibbon speed={speed} sessionPoints={sessionPoints} onSpeed={(next) => void handleSpeed(next)} />
          {replayNotice !== null ? (
            <p role="alert" className="mt-2 text-xs text-miss">
              {replayNotice}
            </p>
          ) : null}
        </>
      ) : null}

      <BroadcastTopBar
        eyebrow={<Eyebrow className="text-center">{competition}</Eyebrow>}
        right={<LatencyHud latency={payload.latency} connectionLost={connection === 'lost'} />}
      />

      {connection === 'lost' ? (
        <div className="mb-3.5">
          <ReconnectingBanner />
        </div>
      ) : null}

      <HowItWorks className="mb-3.5" />

      <div className="flex flex-wrap items-start gap-5">
        <div className="min-w-0 flex-[1_1_430px]">
          <PaperPanel>
            <MatchCockpit
              payload={payload}
              participant1={participant1}
              participant2={participant2}
              startTimeMs={startTimeMs}
              displayClockSeconds={displayClockSeconds}
              connectionLost={connection === 'lost'}
              pitchReduced={pitchReduced}
              onTogglePitch={togglePitch}
              sponsor={sponsorName}
            />
          </PaperPanel>
        </div>

        {callsCollapsed && payload.phase === 'live' ? (
          <div className="flex self-stretch max-sm:w-full">
            <PaperPanel className="h-full w-full sm:w-[76px] sm:flex-none">
              <button
                type="button"
                onClick={() => setCallsCollapsed(false)}
                aria-expanded={false}
                aria-label="Expand open calls"
                className="flex h-full min-h-16 w-full flex-row items-center justify-center gap-3 p-3 transition-colors duration-[var(--duration-small)] ease-[var(--ease-standard)] hover:bg-soft active:scale-[0.99] sm:min-h-[480px] sm:flex-col sm:gap-4"
              >
                <span aria-hidden className="text-sm text-ink-muted">
                  &#171;
                </span>
                <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.24em] text-ink sm:[writing-mode:vertical-rl]">
                  Open calls
                </span>
                <span className="tabular flex size-6 flex-none items-center justify-center rounded-full bg-accent font-mono text-xs font-semibold text-[var(--on-accent)]">
                  {payload.catalog.length}
                </span>
              </button>
            </PaperPanel>
          </div>
        ) : (
          <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-5">
            <PaperPanel>{callsSection}</PaperPanel>

            {payload.phase === 'live' && pendingMine.length > 0 ? (
              <section aria-label="Your open calls">
                <Eyebrow>Your open calls</Eyebrow>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {pendingMine.map((entry) => (
                    <span
                      key={entry.pick.id}
                      className="inline-flex items-center gap-2 rounded-chip border border-hairline bg-card px-2.5 py-2 text-[13px] text-ink [animation:chip-in_var(--duration-standard)_var(--ease-enter)_both]"
                    >
                      {entry.pick.claim}
                      <span className="tabular font-mono text-xs text-ink-muted">
                        {formatClockMinutes(entry.pick.lockClockSeconds)}
                      </span>
                    </span>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-start gap-5">
        <div className="min-w-0 flex-[1_1_280px]">
          <BookieCard lastMirroredProbability={lastBookieProbability} />
        </div>

        {mode.kind === 'live' ? (
          <div className="min-w-0 flex-[1_1_300px]">
            <MatchBoard
              fixtureId={mode.fixtureId}
              youPlayerId={session?.playerId ?? null}
              settlementCount={settlements.length}
            />
          </div>
        ) : null}

        {mode.kind === 'live' ? (
          <div className="min-w-0 flex-[1_1_300px]">
            <TerracePanel
              fixtureId={mode.fixtureId}
              initialCode={terraceCode}
              settlementCount={settlements.length}
            />
          </div>
        ) : null}

        <section aria-label="Event feed" className="bc-bronze min-w-0 flex-[1_1_300px] p-4.5">
          <Eyebrow>Event feed</Eyebrow>
          <div className="panel-paper mt-3">
            <EventFeed
              events={payload.recentEvents}
              participant1={participant1}
              participant2={participant2}
              squads={payload.squads}
              playerActions={payload.playerActions}
            />
          </div>
        </section>
      </div>

      <SettlementLayer
        settlements={mySettlements}
        fixtureLine={fixtureLine}
        playerHandle={mode.kind === 'live' ? (session?.handle ?? null) : null}
        isReplay={mode.kind === 'replay'}
      />
      <NearMissLayer notices={myNearMisses} />
      <HalfTimeReport
        clockSeconds={displayClockSeconds}
        phase={payload.phase}
        rows={settledRows}
        bookieTally={bookieHalfTally}
        fixtureLine={fixtureLine}
        scoreLine={scoreLine}
        isReplay={mode.kind === 'replay'}
        withReceiptLinks={mode.kind === 'live'}
      />
    </div>
  );
}
