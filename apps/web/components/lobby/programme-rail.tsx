'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MatchResultProbabilities } from '@calledit/contracts';
import { Eyebrow } from '../ui/eyebrow';
import { FlagRoundel } from '../ui/flag-roundel';
import { createReplaySession, REPLAY_FAILURE_COPY } from '../../lib/replay-api';
import { formatClockMmSs } from '../../lib/format';

/**
 * The programme shelf (broadcast lobby skin): match editions on a floodlit
 * stage inside a gilded frame. Finished editions carry the replay stamp, the
 * live edition pops off the shelf with the gold border, upcoming editions
 * count down with the real pre-match 1X2 teaser. The shelf scrolls sideways
 * (native snap scroll, plus mouse drag on desktop).
 */

// The lobby promise ("Play it back at 10x"): rail sessions start at 10x.
const DEFAULT_REPLAY_SPEED = 10;

// Mouse travel in px before a shelf drag suppresses the click underneath.
const DRAG_CLICK_THRESHOLD_PX = 6;

export interface RailReplayEntry {
  kind: 'replay';
  fixtureId: number;
  participant1: string;
  participant2: string;
  competition: string;
  /** Final score when the live state still knows it; never invented. */
  score: { p1: number; p2: number } | null;
}

export interface RailLiveEntry {
  kind: 'live';
  fixtureId: number;
  participant1: string;
  participant2: string;
  goalsP1: number;
  goalsP2: number;
  clockSeconds: number;
  matchResult: MatchResultProbabilities | null;
}

export interface RailUpcomingEntry {
  kind: 'upcoming';
  fixtureId: number;
  participant1: string;
  participant2: string;
  competition: string;
  startTimeMs: number;
  matchResult: MatchResultProbabilities | null;
}

export type RailEntry = RailReplayEntry | RailLiveEntry | RailUpcomingEntry;

function countdownText(startTimeMs: number, nowMs: number): string {
  const remainingMs = startTimeMs - nowMs;
  if (remainingMs <= 0) {
    return 'kick-off imminent';
  }
  const totalMinutes = Math.floor(remainingMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) {
    return `kicks off in ${days}d ${String(hours).padStart(2, '0')}h`;
  }
  if (hours > 0) {
    return `kicks off in ${hours}h ${String(minutes).padStart(2, '0')}m`;
  }
  return `kicks off in ${Math.max(1, minutes)}m`;
}

function kickoffDayLabel(startTimeMs: number): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
    new Date(startTimeMs),
  );
}

function teaserPercents(matchResult: MatchResultProbabilities): [number, number, number] {
  return [
    Math.round(matchResult.p1 * 100),
    Math.round(matchResult.draw * 100),
    Math.round(matchResult.p2 * 100),
  ];
}

function FlagPair({ p1, p2 }: { p1: string; p2: string }) {
  return (
    <span aria-hidden className="flex flex-none">
      <FlagRoundel teamName={p1} size={20} className="[box-shadow:0_0_0_1.5px_var(--bc-card-hi)]" />
      <FlagRoundel
        teamName={p2}
        size={20}
        className="-ml-1.5 [box-shadow:0_0_0_1.5px_var(--bc-card-hi)]"
      />
    </span>
  );
}

function TeaserBar({ percents }: { percents: [number, number, number] }) {
  const [p1, draw, p2] = percents;
  return (
    <>
      <span aria-hidden className="flex h-[5px] gap-[3px]">
        <span
          className="block rounded-full bg-[linear-gradient(90deg,var(--bc-live-deep),var(--bc-live))] [box-shadow:0_0_8px_rgba(88,214,141,0.7)]"
          style={{ flexGrow: p1, flexBasis: 0 }}
        />
        <span
          className="block rounded-full bg-[var(--bc-slot-mid)]"
          style={{ flexGrow: draw, flexBasis: 0 }}
        />
        <span
          className="block rounded-full bg-[var(--bc-slot-low)]"
          style={{ flexGrow: p2, flexBasis: 0 }}
        />
      </span>
      <span className="tabular mt-2 block font-mono text-[11px] text-ink-muted">
        {p1} / {draw} / {p2}
      </span>
    </>
  );
}

const CARD_BASE_CLASSES =
  'bc-card flex min-h-[164px] w-[250px] flex-none flex-col p-4 text-left text-ink no-underline transition-transform duration-[var(--duration-small)] ease-[var(--ease-standard)] hover:-translate-y-1 hover:border-[var(--accent)] active:scale-[0.97]';

function ReplayCard({ entry }: { entry: RailReplayEntry }) {
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const handleStart = async (): Promise<void> => {
    if (isStarting) {
      return;
    }
    setIsStarting(true);
    setStartError(null);
    const created = await createReplaySession(entry.fixtureId, DEFAULT_REPLAY_SPEED);
    if (!created.ok) {
      setStartError(REPLAY_FAILURE_COPY[created.reason]);
      setIsStarting(false);
      return;
    }
    router.push(`/replay/${created.session.sessionId}`);
  };

  return (
    <button
      type="button"
      onClick={() => {
        void handleStart();
      }}
      disabled={isStarting}
      aria-label={`Final edition, ${entry.participant1} vs ${entry.participant2}, replay as live`}
      className={`${CARD_BASE_CLASSES} bc-card-replay cursor-pointer disabled:cursor-wait`}
    >
      <div className="flex items-start justify-between gap-2.5">
        <span className="tabular inline-block rounded-chip border border-dashed border-[var(--accent-line)] bg-accent-soft px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-accent-deep">
          Final edition
        </span>
        <FlagPair p1={entry.participant1} p2={entry.participant2} />
      </div>
      <div className="mt-auto">
        <p className="m-0 text-[15px] font-semibold tracking-[-0.01em]">
          {entry.participant1}{' '}
          {entry.score !== null ? (
            <span className="tabular font-mono text-[17px] font-semibold">
              {entry.score.p1}-{entry.score.p2}
            </span>
          ) : (
            <span className="text-ink-muted">vs</span>
          )}{' '}
          {entry.participant2}
        </p>
        <span className="tabular mt-1.5 block font-mono text-xs text-ink-muted">
          {entry.competition} &middot; {isStarting ? 'starting the replay...' : 'replay as live'}
        </span>
        {startError !== null ? (
          <span role="alert" className="mt-1 block text-xs text-miss">
            {startError}
          </span>
        ) : null}
      </div>
    </button>
  );
}

function LiveCard({ entry }: { entry: RailLiveEntry }) {
  const percents = entry.matchResult === null ? null : teaserPercents(entry.matchResult);
  const p1Code = entry.participant1.slice(0, 3).toUpperCase();
  const p2Code = entry.participant2.slice(0, 3).toUpperCase();
  return (
    <div className="flex flex-none [animation:live-pop_var(--duration-small)_var(--ease-enter)_640ms_both]">
      <Link
        href={`/match/${entry.fixtureId}`}
        aria-label={`Live, ${entry.participant1} ${entry.goalsP1}-${entry.goalsP2} ${entry.participant2}`}
        className="bc-card bc-card-pop flex min-h-[164px] w-[290px] flex-col gap-2.5 p-4 text-ink no-underline transition-transform duration-[var(--duration-small)] ease-[var(--ease-standard)] hover:-translate-y-1 active:scale-[0.97]"
      >
        <div className="flex items-center justify-between gap-2.5">
          <span className="tabular inline-flex items-center gap-1.5 rounded-full border border-[rgba(127,224,160,0.5)] bg-[rgba(8,12,10,0.75)] px-2.5 py-0.5 font-mono text-[10px] font-medium tracking-[0.14em] text-[var(--bc-live-dim)]">
            <span
              aria-hidden
              className="size-1.5 rounded-full bg-[var(--bc-live)] [box-shadow:0_0_8px_rgba(88,214,141,0.9)] [animation:dot-pulse_1.6s_var(--ease-standard)_infinite]"
            />
            LIVE {formatClockMmSs(entry.clockSeconds)}
          </span>
          <FlagPair p1={entry.participant1} p2={entry.participant2} />
        </div>
        <span className="tabular font-mono text-[20px] font-semibold text-white">
          {p1Code} {entry.goalsP1}-{entry.goalsP2} {p2Code}
        </span>
        {percents !== null ? (
          <span aria-hidden className="mt-auto flex h-[3px] gap-[2px]">
            <span
              className="block rounded-full bg-[var(--bc-live)]"
              style={{ flexGrow: percents[0], flexBasis: 0 }}
            />
            <span
              className="block rounded-full bg-[var(--bc-slot-mid)]"
              style={{ flexGrow: percents[1], flexBasis: 0 }}
            />
            <span
              className="block rounded-full bg-[var(--bc-slot-low)]"
              style={{ flexGrow: percents[2], flexBasis: 0 }}
            />
          </span>
        ) : (
          <span className="mt-auto" />
        )}
        <div className="flex items-baseline justify-between gap-2.5">
          <span className="tabular font-mono text-[11px] text-ink-muted">tap to call it</span>
          {percents !== null ? (
            <span className="tabular font-mono text-[11px] text-[var(--bc-live-dim)]">
              {p1Code} {percents[0]}%
            </span>
          ) : null}
        </div>
      </Link>
    </div>
  );
}

function UpcomingCard({ entry, nowMs }: { entry: RailUpcomingEntry; nowMs: number }) {
  const percents = entry.matchResult === null ? null : teaserPercents(entry.matchResult);
  const isImminent = entry.startTimeMs <= nowMs;
  return (
    <Link
      href={`/match/${entry.fixtureId}`}
      aria-label={`${entry.participant1} vs ${entry.participant2}, ${countdownText(entry.startTimeMs, nowMs)}`}
      className={`${CARD_BASE_CLASSES} w-[262px]`}
    >
      <div className="flex items-start justify-between gap-2.5">
        <span className="tabular inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-muted">
          <span aria-hidden className="text-accent">
            &middot;
          </span>
          <span suppressHydrationWarning>{kickoffDayLabel(entry.startTimeMs)}</span> &middot;{' '}
          {entry.competition}
          <span aria-hidden className="text-accent">
            &middot;
          </span>
        </span>
        <FlagPair p1={entry.participant1} p2={entry.participant2} />
      </div>
      <p className="m-0 mt-2.5 text-[16px] font-semibold tracking-[-0.01em]">
        {entry.participant1} vs {entry.participant2}
      </p>
      <span
        className={`tabular mt-1 block font-mono text-[11px] ${
          isImminent ? 'text-[var(--bc-live-dim)]' : 'text-ink-muted'
        }`}
        suppressHydrationWarning
      >
        {countdownText(entry.startTimeMs, nowMs)}
      </span>
      <div className="mt-auto pt-3">
        {percents !== null ? (
          <TeaserBar percents={percents} />
        ) : (
          <span className="tabular block font-mono text-[11px] text-ink-faint">
            market opens closer to kickoff
          </span>
        )}
      </div>
    </Link>
  );
}

/** Floodlight banks and the crowd band along the top of the shelf. */
function ShelfLights() {
  return (
    <div aria-hidden className="pointer-events-none">
      <div className="absolute inset-x-0 top-3 flex justify-around px-[8%] max-sm:hidden">
        <div className="flood-bank h-6 w-24" />
        <div className="flood-bank h-6 w-24 [animation-duration:3.8s]" />
        <div className="flood-bank h-6 w-24 [animation-duration:3s]" />
        <div className="flood-bank h-6 w-24 [animation-duration:4.1s]" />
      </div>
      <div className="crowd-band absolute inset-x-0 top-0 h-[54px]" />
      <div className="flood-cone absolute left-[9%] top-8 h-60 w-[210px] max-sm:hidden" />
      <div className="flood-cone absolute right-[9%] top-8 h-60 w-[210px] max-sm:hidden" />
      <div className="flood-wash absolute inset-0" />
    </div>
  );
}

/** The stage floor: layered gold ellipses the popped edition stands on. */
function StageFloor() {
  return (
    <div aria-hidden className="pointer-events-none">
      <div className="stage-floor-shadow absolute bottom-5 left-1/2 h-[70px] w-[840px] max-w-none -translate-x-1/2" />
      <div className="stage-floor-ring absolute bottom-[26px] left-1/2 h-14 w-[760px] max-w-none -translate-x-1/2" />
      <div className="stage-floor-ring-inner absolute bottom-[33px] left-1/2 h-9 w-[560px] max-w-none -translate-x-1/2" />
    </div>
  );
}

export function ProgrammeRail({ entries }: { entries: RailEntry[] }) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ startX: number; startScrollLeft: number; didDrag: boolean } | null>(
    null,
  );
  const [isDragging, setIsDragging] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Countdown labels tick once a minute; the digits swap, nothing animates.
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Center the live (or first upcoming) edition on load. The scroll waits a
  // frame so it lands after layout settles and snap keeps the seat.
  useEffect(() => {
    const row = rowRef.current;
    if (row === null) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      const focus = row.querySelector<HTMLElement>('[data-rail-focus]');
      if (focus !== null) {
        row.scrollLeft = focus.offsetLeft + focus.offsetWidth / 2 - row.clientWidth / 2;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [entries.length]);

  // Mouse drag scrolls the shelf; touch and trackpad already scroll natively.
  const handleShelfPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || rowRef.current === null) {
      return;
    }
    dragRef.current = {
      startX: event.clientX,
      startScrollLeft: rowRef.current.scrollLeft,
      didDrag: false,
    };
    setIsDragging(true);
  };
  const handleShelfPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    const row = rowRef.current;
    if (drag === null || row === null) {
      return;
    }
    const deltaX = event.clientX - drag.startX;
    if (Math.abs(deltaX) > DRAG_CLICK_THRESHOLD_PX) {
      drag.didDrag = true;
    }
    row.scrollLeft = drag.startScrollLeft - deltaX;
  };
  const handleShelfPointerEnd = (): void => {
    setIsDragging(false);
    // didDrag survives until the click fires so the guard below can read it.
    if (dragRef.current !== null && !dragRef.current.didDrag) {
      dragRef.current = null;
    }
  };
  const suppressClickAfterDrag = (event: React.MouseEvent<HTMLDivElement>): void => {
    if (dragRef.current?.didDrag === true) {
      event.preventDefault();
      event.stopPropagation();
    }
    dragRef.current = null;
  };

  const focusIndex = (() => {
    const liveIndex = entries.findIndex((entry) => entry.kind === 'live');
    if (liveIndex >= 0) {
      return liveIndex;
    }
    const upcomingIndex = entries.findIndex((entry) => entry.kind === 'upcoming');
    return upcomingIndex >= 0 ? upcomingIndex : 0;
  })();

  return (
    <section aria-label="The programme rail" id="programme-rail" className="mt-10">
      <div className="mx-0.5 mb-3 flex items-baseline justify-between gap-3">
        <Eyebrow>The programme</Eyebrow>
        <span className="tabular rounded-full border border-[var(--bc-gilt-line)] bg-[rgba(22,17,9,0.85)] px-3 py-1 font-mono text-xs text-accent-deep [box-shadow:0_4px_10px_rgba(0,0,0,0.4)]">
          {entries.length} {entries.length === 1 ? 'edition' : 'editions'}
        </span>
      </div>
      <div className="gilt-frame">
        <div className="bc-pitch relative overflow-hidden">
          <ShelfLights />
          <div
            ref={rowRef}
            onPointerDown={handleShelfPointerDown}
            onPointerMove={handleShelfPointerMove}
            onPointerUp={handleShelfPointerEnd}
            onPointerLeave={handleShelfPointerEnd}
            onClickCapture={suppressClickAfterDrag}
            className={`scrollbar-none relative z-[3] snap-x snap-mandatory overflow-x-auto overflow-y-hidden select-none ${
              isDragging ? 'cursor-grabbing' : 'cursor-grab'
            }`}
          >
            <div className="mx-auto flex w-max items-end gap-5 px-7 pb-8 pt-16 max-sm:pt-10">
              {entries.map((entry, index) => {
                let card: ReactNode;
                if (entry.kind === 'replay') {
                  card = <ReplayCard entry={entry} />;
                } else if (entry.kind === 'live') {
                  card = <LiveCard entry={entry} />;
                } else {
                  card = <UpcomingCard entry={entry} nowMs={nowMs} />;
                }
                return (
                  <div
                    key={`${entry.kind}-${entry.fixtureId}`}
                    data-rail-focus={index === focusIndex ? '' : undefined}
                    className="flex snap-center [animation:deck-in_var(--duration-standard)_var(--ease-enter)_both]"
                    style={{ animationDelay: `${300 + index * 40}ms` }}
                  >
                    {card}
                  </div>
                );
              })}
            </div>
          </div>
          <StageFloor />
          <p className="tabular relative z-[3] mb-3 mt-0 text-center font-mono text-xs text-ink-faint">
            the shelf scrolls sideways, the live edition pops off it
          </p>
        </div>
      </div>
    </section>
  );
}
