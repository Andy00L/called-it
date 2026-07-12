'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { MatchResultProbabilities } from '@calledit/contracts';
import { Eyebrow } from '../ui/eyebrow';
import { FlagRoundel } from '../ui/flag-roundel';
import { createReplaySession, REPLAY_FAILURE_COPY } from '../../lib/replay-api';
import { formatClockMmSs } from '../../lib/format';

/**
 * The programme rail (lobby): one horizontal shelf of match editions riding
 * a dashed arc, the wheel's counter-arc. Finished editions carry the replay
 * stamp, the live edition pops off the shelf on the ink plate, upcoming
 * editions count down with the real pre-match 1X2 teaser. Cards re-seat on
 * the arc as the shelf scrolls (transform only, rAF-throttled).
 */

// Arc geometry from the accepted export: a flat-ish circle of radius 5200
// sampled around the row center, 14px of base drop, clamped at +-560px.
const ARC_RADIUS = 5200;
const ARC_BASE_DROP = 14;
const ARC_CLAMP_PX = 560;
const RAD_TO_DEG = 57.2958;

// The lobby promise ("Play it back at 10x"): rail sessions start at 10x.
const DEFAULT_REPLAY_SPEED = 10;

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

function FlagPair({ p1, p2, onInk = false }: { p1: string; p2: string; onInk?: boolean }) {
  const overlapRing = onInk
    ? '[box-shadow:0_0_0_1.5px_var(--ink)]'
    : '[box-shadow:0_0_0_1.5px_var(--card)]';
  return (
    <span aria-hidden className="flex flex-none">
      <FlagRoundel teamName={p1} size={20} className={overlapRing} />
      <FlagRoundel teamName={p2} size={20} className={`-ml-1.5 ${overlapRing}`} />
    </span>
  );
}

function TeaserBar({ percents }: { percents: [number, number, number] }) {
  const [p1, draw, p2] = percents;
  return (
    <>
      <span aria-hidden className="flex h-[3px] overflow-hidden rounded-[2px]">
        <span className="block bg-accent" style={{ flexGrow: p1, flexBasis: 0 }} />
        <span className="block bg-pulse-mid" style={{ flexGrow: draw, flexBasis: 0 }} />
        <span className="block bg-pulse-low" style={{ flexGrow: p2, flexBasis: 0 }} />
      </span>
      <span className="tabular mt-1.5 block font-mono text-[10px] text-ink-muted">
        {p1} / {draw} / {p2}
      </span>
    </>
  );
}

const CARD_BASE_CLASSES =
  'flex min-h-[150px] flex-1 flex-col rounded-card border border-hairline bg-card p-4 text-left text-ink no-underline transition-transform duration-[var(--duration-small)] ease-[var(--ease-standard)] hover:-translate-y-0.5 active:scale-[0.97]';

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
      className={`${CARD_BASE_CLASSES} cursor-pointer disabled:cursor-wait`}
    >
      <div className="flex items-start justify-between gap-2.5">
        <span className="inline-block -rotate-[4deg] rounded-chip border border-dashed border-[var(--streak-line)] bg-[var(--streak-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-streak">
          Final edition
        </span>
        <FlagPair p1={entry.participant1} p2={entry.participant2} />
      </div>
      <div className="mt-auto">
        <p className="m-0 text-[15px] font-medium tracking-[-0.01em]">
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
        <span className="mt-1 block text-xs text-ink-muted">
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
    <div className="flex flex-1 [animation:live-pop_var(--duration-small)_var(--ease-enter)_640ms_both]">
      <Link
        href={`/match/${entry.fixtureId}`}
        aria-label={`Live, ${entry.participant1} ${entry.goalsP1}-${entry.goalsP2} ${entry.participant2}`}
        className="flex min-h-[150px] flex-1 flex-col gap-2 rounded-card bg-ink p-4 text-cream no-underline transition-transform duration-[var(--duration-small)] ease-[var(--ease-standard)] [box-shadow:0_2px_3px_rgba(18,23,15,0.15),0_14px_20px_rgba(18,23,15,0.2)] hover:-translate-y-0.5 active:scale-[0.97]"
      >
        <div className="flex items-center justify-between gap-2.5">
          <span className="tabular inline-flex items-center gap-1.5 font-mono text-[11px] font-medium tracking-[0.14em] text-[#3FBF54]">
            <span
              aria-hidden
              className="size-1.5 rounded-full bg-[#3FBF54] [animation:dot-pulse_1.6s_var(--ease-standard)_infinite]"
            />
            LIVE {formatClockMmSs(entry.clockSeconds)}
          </span>
          <FlagPair p1={entry.participant1} p2={entry.participant2} onInk />
        </div>
        <span className="tabular font-mono text-[19px] font-semibold text-cream">
          {p1Code} {entry.goalsP1}-{entry.goalsP2} {p2Code}
        </span>
        {percents !== null ? (
          <span aria-hidden className="mt-auto flex h-0.5 overflow-hidden rounded-[2px]">
            <span className="block bg-[#3FBF54]" style={{ flexGrow: percents[0], flexBasis: 0 }} />
            <span
              className="block bg-pulse-mid opacity-50"
              style={{ flexGrow: percents[1], flexBasis: 0 }}
            />
            <span
              className="block bg-pulse-low opacity-50"
              style={{ flexGrow: percents[2], flexBasis: 0 }}
            />
          </span>
        ) : (
          <span className="mt-auto" />
        )}
        <div className="flex items-baseline justify-between gap-2.5">
          <span className="tabular font-mono text-[11px] text-ink-faint">tap to call it</span>
          {percents !== null ? (
            <span className="tabular font-mono text-[11px] text-ink-faint">
              <span className="text-[#3FBF54]">
                {p1Code} {percents[0]}%
              </span>
            </span>
          ) : null}
        </div>
      </Link>
    </div>
  );
}

function UpcomingCard({ entry, nowMs }: { entry: RailUpcomingEntry; nowMs: number }) {
  const percents = entry.matchResult === null ? null : teaserPercents(entry.matchResult);
  return (
    <Link
      href={`/match/${entry.fixtureId}`}
      aria-label={`${entry.participant1} vs ${entry.participant2}, ${countdownText(entry.startTimeMs, nowMs)}`}
      className={CARD_BASE_CLASSES}
    >
      <div className="flex items-start justify-between gap-2.5">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
          <span aria-hidden className="text-[8px] text-accent">
            &#9656;
          </span>
          <span suppressHydrationWarning>{kickoffDayLabel(entry.startTimeMs)}</span> &middot;{' '}
          {entry.competition}
          <span aria-hidden className="text-[8px] text-accent">
            &#9666;
          </span>
        </span>
        <FlagPair p1={entry.participant1} p2={entry.participant2} />
      </div>
      <p className="m-0 mt-2 text-sm font-medium tracking-[-0.01em]">
        {entry.participant1} vs {entry.participant2}
      </p>
      <span className="tabular mt-1 block font-mono text-[11px] text-ink-muted" suppressHydrationWarning>
        {countdownText(entry.startTimeMs, nowMs)}
      </span>
      <div className="mt-auto pt-2">
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

export function ProgrammeRail({ entries }: { entries: RailEntry[] }) {
  const rowRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number>(0);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Countdown labels tick once a minute; the digits swap, nothing animates.
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const applyArc = useCallback(() => {
    const row = rowRef.current;
    if (row === null) {
      return;
    }
    const midX = row.clientWidth / 2;
    for (const wrapper of row.querySelectorAll<HTMLElement>('[data-arc]')) {
      const seat = wrapper.firstElementChild;
      if (!(seat instanceof HTMLElement)) {
        continue;
      }
      const centerX = wrapper.offsetLeft + wrapper.offsetWidth / 2 - row.scrollLeft;
      const deltaX = Math.max(-ARC_CLAMP_PX, Math.min(ARC_CLAMP_PX, centerX - midX));
      const dropPx = ARC_BASE_DROP - (deltaX * deltaX) / (2 * ARC_RADIUS);
      const tiltDeg = -(deltaX / ARC_RADIUS) * RAD_TO_DEG;
      seat.style.transform = `translateY(${dropPx.toFixed(1)}px) rotate(${tiltDeg.toFixed(2)}deg)`;
    }
  }, []);

  useEffect(() => {
    const row = rowRef.current;
    if (row === null) {
      return;
    }
    const scheduleArc = (): void => {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(applyArc);
    };
    row.addEventListener('scroll', scheduleArc, { passive: true });
    window.addEventListener('resize', scheduleArc);
    // Center the live (or first upcoming) edition on load, then seat the arc.
    const focus = row.querySelector<HTMLElement>('[data-rail-focus]');
    if (focus !== null) {
      row.scrollLeft = focus.offsetLeft + focus.offsetWidth / 2 - row.clientWidth / 2;
    }
    scheduleArc();
    return () => {
      row.removeEventListener('scroll', scheduleArc);
      window.removeEventListener('resize', scheduleArc);
      cancelAnimationFrame(frameRef.current);
    };
  }, [applyArc, entries.length]);

  const focusIndex = (() => {
    const liveIndex = entries.findIndex((entry) => entry.kind === 'live');
    if (liveIndex >= 0) {
      return liveIndex;
    }
    const upcomingIndex = entries.findIndex((entry) => entry.kind === 'upcoming');
    return upcomingIndex >= 0 ? upcomingIndex : 0;
  })();

  return (
    <section aria-label="The programme rail" id="programme-rail" className="mt-7">
      <div className="mx-0.5 mb-2.5 flex items-baseline justify-between gap-3">
        <Eyebrow>The programme</Eyebrow>
        <span className="tabular font-mono text-[11px] text-ink-faint">
          {entries.length} {entries.length === 1 ? 'edition' : 'editions'}
        </span>
      </div>
      <div className="tray px-4 pb-2.5 pt-3.5">
        <div className="relative">
          <svg
            aria-hidden
            className="pointer-events-none absolute -inset-x-2 bottom-0.5 h-14 w-[calc(100%+16px)]"
            viewBox="0 0 1000 56"
            preserveAspectRatio="none"
          >
            <path
              d="M0 12 Q500 56 1000 12"
              fill="none"
              stroke="rgba(18,23,15,0.16)"
              strokeWidth="1.5"
              strokeDasharray="5 7"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <div
            ref={rowRef}
            className="scrollbar-none relative z-[1] flex snap-x snap-mandatory items-stretch gap-3.5 overflow-x-auto overflow-y-hidden px-0.5 pb-[30px] pt-[26px]"
          >
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
                  data-arc
                  data-rail-focus={index === focusIndex ? '' : undefined}
                  className="flex min-w-[240px] flex-[1_1_240px] snap-center [animation:deck-in_var(--duration-standard)_var(--ease-enter)_both]"
                  style={{ animationDelay: `${300 + index * 40}ms` }}
                >
                  <div className="flex flex-1" style={{ transform: `translateY(${ARC_BASE_DROP}px)` }}>
                    {card}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <p className="mb-1 mt-1.5 text-center text-[11px] text-ink-faint">
          the shelf scrolls sideways, the live edition pops off it
        </p>
      </div>
    </section>
  );
}
