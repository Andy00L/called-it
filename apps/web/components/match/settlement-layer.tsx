'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { streakMultiplier, type SettlementNotice } from '@calledit/contracts';
import { Button } from '../ui/button';
import { buttonClassName } from '../ui/button-styles';
import { playReceiptPrintFeedback } from '../../lib/print-feedback';
import { usePrefersReducedMotion } from '../../lib/use-reduced-motion';
import {
  formatClockMinutes,
  formatMultiplier,
  formatPoints,
  formatProbability,
} from '../../lib/format';

// Toast dwell: long enough to read one line and a verdict (sheet, motion).
const MISS_TOAST_MS = 4000;

function StreakFlame() {
  return (
    <svg aria-hidden width="11" height="13" viewBox="0 0 12 14" fill="var(--streak)">
      <path d="M6 0c.5 2.5 3.5 4 3.5 8a3.5 3.5 0 0 1-7 0c0-1.5.7-2.6 1.5-3.5.3 1.5 1.5 2 1.5 2C5 4 5.5 1.8 6 0z" />
    </svg>
  );
}

function PaperRule() {
  return <div aria-hidden className="my-2 border-t border-dashed [border-color:var(--paper-rule)]" />;
}

/**
 * The hit receipt print-in (the product's hero moment and its ONE overshoot,
 * sheet motion section) plus the miss toast. Settles one notice at a time,
 * newest first; hits hold until dismissed, misses fade on a timer.
 */
export function SettlementLayer({
  settlements,
  fixtureLine,
  playerHandle,
  isReplay,
}: {
  settlements: SettlementNotice[];
  fixtureLine: string;
  playerHandle: string | null;
  isReplay: boolean;
}) {
  const [dismissedIds, setDismissedIds] = useState<ReadonlySet<string>>(new Set());
  const prefersReducedMotion = usePrefersReducedMotion();
  const printFeedbackPlayedForRef = useRef<string | null>(null);

  const active = settlements.filter((notice) => !dismissedIds.has(notice.pick.id)).at(-1);

  // The print-in gets its physical layer once per hit (external systems:
  // audio hardware and the vibration motor; armed by the lock press).
  useEffect(() => {
    if (active === undefined || active.outcome !== 'hit') {
      return;
    }
    if (printFeedbackPlayedForRef.current === active.pick.id) {
      return;
    }
    printFeedbackPlayedForRef.current = active.pick.id;
    playReceiptPrintFeedback(prefersReducedMotion);
  }, [active, prefersReducedMotion]);

  const dismiss = (pickId: string): void => {
    setDismissedIds((previous) => new Set(previous).add(pickId));
  };

  // Misses auto-dismiss; an interval-free one-shot timer is cleaned up on
  // change (external system: the timer).
  useEffect(() => {
    if (active === undefined || active.outcome !== 'miss') {
      return;
    }
    const pickId = active.pick.id;
    const timer = setTimeout(() => dismiss(pickId), MISS_TOAST_MS);
    return () => clearTimeout(timer);
  }, [active]);

  if (active === undefined) {
    return null;
  }

  if (active.outcome === 'miss') {
    return (
      <div
        role="status"
        className="fixed bottom-5 left-1/2 z-50 w-[340px] max-w-[calc(100vw-40px)] -translate-x-1/2 rounded-card bg-ink px-4 py-3.5 text-white [animation:toast-in_var(--duration-standard)_var(--ease-enter)_both] [box-shadow:var(--shadow-float)]"
      >
        <p className="text-sm font-medium">{active.pick.claim}</p>
        <div className="mt-1.5 flex items-baseline gap-2.5">
          <span className="tabular font-mono text-lg font-semibold text-miss">MISS</span>
          <span className="text-xs text-white/55">streak reset</span>
        </div>
      </div>
    );
  }

  const nextMultiplier = streakMultiplier(active.newStreak);

  return (
    <div
      role="dialog"
      aria-label="Call settled: hit"
      className="fixed inset-0 z-50 flex items-end justify-center bg-cream/60 pb-6"
      onClick={() => dismiss(active.pick.id)}
    >
      <div
        className="w-[300px]"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="rotate-[0.6deg] [animation:receipt-in_var(--duration-hero)_var(--ease-enter)_both] [box-shadow:var(--shadow-receipt)]">
          <div className="receipt-perforation-top" aria-hidden />
          <div className="tabular bg-paper px-4 py-3 font-mono text-xs leading-[1.65] text-paper-ink">
            <div className="flex justify-between">
              <b className="tracking-[0.14em]">CALLED IT</b>
              <span className="opacity-60">RECEIPT</span>
            </div>
            <PaperRule />
            <div>
              <b>{active.pick.claim}</b>
            </div>
            <div className="opacity-60">{fixtureLine}</div>
            <div>
              locked {formatClockMinutes(active.pick.lockClockSeconds)} at{' '}
              {formatProbability(active.pick.probabilityFraction)}
              {playerHandle !== null ? ` by ${playerHandle}` : ''}
            </div>
            <PaperRule />
            <div className="flex items-baseline justify-between">
              <span className="opacity-60">RESULT</span>
              <b className="text-sm">HIT +{formatPoints(active.pointsAwarded)} pts</b>
            </div>
            {active.newStreak >= 2 ? (
              <div className="flex items-center justify-between">
                <span className="opacity-60">STREAK</span>
                <span className="inline-flex items-center gap-[5px]">
                  <StreakFlame />
                  <b>streak {formatMultiplier(nextMultiplier)}</b>
                </span>
              </div>
            ) : null}
            <PaperRule />
            <div className="text-center tracking-[0.14em] opacity-60">
              {isReplay ? 'REPLAY, NOT RANKED' : 'ANCHORING ON SOLANA'}
            </div>
          </div>
          <div className="receipt-perforation-bottom" aria-hidden />
        </div>

        <div className="mt-3.5 flex justify-center gap-2.5">
          {isReplay ? null : (
            <Link href={`/r/${active.pick.id}`} className={buttonClassName('primary')}>
              View receipt
            </Link>
          )}
          <Button variant="ghost" onClick={() => dismiss(active.pick.id)}>
            Keep playing
          </Button>
        </div>
      </div>
    </div>
  );
}
