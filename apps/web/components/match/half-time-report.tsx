'use client';

import { useEffect, useState } from 'react';
import type { MatchPhase } from '@calledit/contracts';
import { Button } from '../ui/button';
import type { SettledRow } from './final-edition';
import { formatPoints, formatProbability } from '../../lib/format';

// Football half-time on the feed clock, in seconds: the report prints when
// the display clock crosses 45' and stays offered through the break.
const HALF_TIME_CLOCK_SECONDS = 45 * 60;
// A viewer joining past this clock never gets a stale half-time report; the
// break plus first-half stoppage comfortably fits inside ten clock minutes.
const HALF_TIME_WINDOW_END_SECONDS = 55 * 60;
// Copied confirmation dwell (sourceRef: components/receipt/receipt-actions.tsx).
const COPIED_RESET_MS = 1200;

interface HalfTally {
  settled: number;
  hits: number;
}

function PaperRule() {
  return (
    <div aria-hidden className="my-2 border-t border-dashed [border-color:var(--paper-rule)]" />
  );
}

/**
 * The half-time report (peak-end: the break is the built-in intermission):
 * once the clock crosses 45' a mini receipt prints in from the bottom with
 * the first-half duel score against The Bookie and the best call so far.
 * Prints only when the viewer has at least one settled call, freezes its
 * content at print time, and never returns once dismissed. Sits under the
 * settlement layer (z-40 vs z-50) so a real receipt always wins the screen.
 */
export function HalfTimeReport({
  clockSeconds,
  phase,
  rows,
  bookieTally,
  fixtureLine,
  scoreLine,
  isReplay,
  withReceiptLinks,
}: {
  clockSeconds: number;
  phase: MatchPhase;
  /** The viewer's settled calls so far; all first-half at print time. */
  rows: SettledRow[];
  /** Settled Bookie mirrors of the viewer's calls, tallied by the caller. */
  bookieTally: HalfTally;
  fixtureLine: string;
  scoreLine: string;
  isReplay: boolean;
  /** Live matches share the best receipt URL; replay picks are private. */
  withReceiptLinks: boolean;
}) {
  const [printedReport, setPrintedReport] = useState<{ rows: SettledRow[] } | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // Latch by adjusting state during render (the React derived-state pattern;
  // no effect needed): the first render inside the half-time window with at
  // least one settled call freezes the report content.
  const isInHalfTimeWindow =
    phase === 'live' &&
    clockSeconds >= HALF_TIME_CLOCK_SECONDS &&
    clockSeconds <= HALF_TIME_WINDOW_END_SECONDS;
  if (printedReport === null && isInHalfTimeWindow && rows.length > 0) {
    setPrintedReport({ rows });
  }

  useEffect(() => {
    // External system: the one-shot reset timer for the copied confirmation.
    if (!isCopied) {
      return;
    }
    const timer = setTimeout(() => setIsCopied(false), COPIED_RESET_MS);
    return () => clearTimeout(timer);
  }, [isCopied]);

  if (printedReport === null || isDismissed) {
    return null;
  }

  const settledRows = printedReport.rows;
  const hitRows = settledRows.filter((row) => row.outcome === 'hit');
  const bestHit = hitRows.reduce<SettledRow | null>(
    (best, row) => (best === null || row.pointsAwarded > best.pointsAwarded ? row : best),
    null,
  );
  // The rows freeze at print time; the Bookie tally stays live because its
  // mirrors can trickle in over SSE moments after the latch (a reload during
  // the break), and the clock is stopped, so it only grows toward the truth.
  const bookie = bookieTally;

  const handleShare = async (): Promise<void> => {
    const shareText = `Half-time in ${fixtureLine}: I hit ${hitRows.length} of ${settledRows.length} calls${
      bookie.settled > 0 ? `, The Bookie hit ${bookie.hits} of ${bookie.settled}` : ''
    }.`;
    const shareUrl =
      withReceiptLinks && bestHit !== null
        ? `${window.location.origin}/r/${bestHit.pick.id}`
        : window.location.origin;
    // Web Share where the platform has it (mobile); clipboard otherwise.
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text: shareText, url: shareUrl });
        return;
      } catch {
        // Share sheet dismissed or unavailable: fall through to the clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
      setIsCopied(true);
    } catch {
      // Clipboard denied (permissions): the report itself stays on screen.
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Half-time report"
      className="fixed inset-0 z-40 flex items-end justify-center bg-cream/60 pb-6"
      onClick={() => setIsDismissed(true)}
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
              <span className="opacity-60">HALF-TIME</span>
            </div>
            <PaperRule />
            <div>
              <b>{scoreLine}</b>
            </div>
            <div className="opacity-60">{fixtureLine}</div>
            <PaperRule />
            <div className="flex items-baseline justify-between">
              <span className="opacity-60">YOU</span>
              <b>
                {hitRows.length} of {settledRows.length} hit
              </b>
            </div>
            {bookie.settled > 0 ? (
              <div className="flex items-baseline justify-between">
                <span className="opacity-60">THE BOOKIE</span>
                <span>
                  {bookie.hits} of {bookie.settled} hit
                </span>
              </div>
            ) : null}
            {bestHit !== null ? (
              <>
                <PaperRule />
                <div className="opacity-60">BEST CALL</div>
                <div>
                  <b>{bestHit.pick.claim}</b>
                </div>
                <div>
                  locked at {formatProbability(bestHit.pick.probabilityFraction)} · +
                  {formatPoints(bestHit.pointsAwarded)} pts
                </div>
              </>
            ) : null}
            <PaperRule />
            <div className="text-center tracking-[0.14em] opacity-60">
              {isReplay ? 'REPLAY, NOT RANKED' : 'THE SECOND HALF IS OPEN'}
            </div>
          </div>
          <div className="receipt-perforation-bottom" aria-hidden />
        </div>

        <div className="mt-3.5 flex justify-center gap-2.5">
          <Button
            variant="primary"
            onClick={() => {
              void handleShare();
            }}
          >
            {isCopied ? 'Copied' : 'Share the half'}
          </Button>
          <Button variant="ghost" onClick={() => setIsDismissed(true)}>
            Keep playing
          </Button>
        </div>
      </div>
    </div>
  );
}
