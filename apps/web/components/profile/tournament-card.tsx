'use client';

import { useEffect, useState } from 'react';
import type { ProfilePayload } from '@calledit/contracts';
import { Tray } from '../ui/surface';
import { Eyebrow } from '../ui/eyebrow';
import { Button } from '../ui/button';
import { formatPoints } from '../../lib/format';

// Copied confirmation dwell (sourceRef: components/receipt/receipt-actions.tsx).
const COPIED_RESET_MS = 1200;

function PaperRule() {
  return (
    <div aria-hidden className="my-2 border-t border-dashed [border-color:var(--paper-rule)]" />
  );
}

/** Overall hit rate from the calibration bands (they carry pick and hit counts). */
function overallHitRate(profile: ProfilePayload): { settled: number; hits: number } {
  return profile.calibration.reduce(
    (totals, bucket) => ({
      settled: totals.settled + bucket.pickCount,
      hits: totals.hits + bucket.hitCount,
    }),
    { settled: 0, hits: 0 },
  );
}

/** Signed percentage-point display for edge: 0.042 -> "+4.2%". */
function formatEdgePct(edgeFraction: number): string {
  const points = edgeFraction * 100;
  return `${points >= 0 ? '+' : ''}${points.toFixed(1)}%`;
}

/**
 * The tournament card (screen 04 addition): the profile's settled record
 * printed as one shareable receipt. Every line is a number the worker
 * already serves; nothing is estimated. The receipt stays the product's one
 * floating object; the card enters with the standard fade-rise, keeping the
 * print-in overshoot reserved for live settlements.
 */
export function TournamentCard({ profile }: { profile: ProfilePayload }) {
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    // External system: the one-shot reset timer for the copied confirmation.
    if (!isCopied) {
      return;
    }
    const timer = setTimeout(() => setIsCopied(false), COPIED_RESET_MS);
    return () => clearTimeout(timer);
  }, [isCopied]);

  const rate = overallHitRate(profile);
  const hitRatePct = rate.settled > 0 ? Math.round((rate.hits / rate.settled) * 100) : 0;
  const margin = profile.bookie.marginPoints;
  const marginLine =
    margin === 0
      ? 'level'
      : margin > 0
        ? `+${formatPoints(margin)} ahead`
        : `${formatPoints(margin)} behind`;

  const handleShare = async (): Promise<void> => {
    const shareText = `My CALLED IT tournament card: ${formatPoints(profile.totalPoints)} pts over ${
      profile.settledPickCount
    } settled calls (${hitRatePct}% hit), best streak ${profile.bestStreak}, ${marginLine} vs The Bookie.`;
    const shareUrl = window.location.origin;
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
      // Clipboard denied (permissions): the card itself stays on screen.
    }
  };

  return (
    <Tray className="p-2">
      <div className="mx-2.5 mb-2 mt-1.5 flex">
        <Eyebrow>My tournament card</Eyebrow>
      </div>
      <div className="flex flex-col items-center px-4 pb-4 pt-2">
        <div className="w-[300px] rotate-[0.6deg] [animation:chip-in_var(--duration-standard)_var(--ease-enter)_both] [box-shadow:var(--shadow-receipt)]">
          <div className="receipt-perforation-top" aria-hidden />
          <div className="tabular bg-paper px-4 py-3 font-mono text-xs leading-[1.65] text-paper-ink">
            <div className="flex justify-between">
              <b className="tracking-[0.14em]">CALLED IT</b>
              <span className="opacity-60">TOURNAMENT CARD</span>
            </div>
            <PaperRule />
            <div>
              <b>{profile.handle}</b>
            </div>
            <div className="opacity-60">World Cup 2026</div>
            <PaperRule />
            <div className="flex items-baseline justify-between">
              <span className="opacity-60">POINTS</span>
              <b className="text-sm">{formatPoints(profile.totalPoints)}</b>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="opacity-60">CALLS</span>
              <span>
                {profile.settledPickCount} settled · {hitRatePct}% hit
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="opacity-60">BEST STREAK</span>
              <span>{profile.bestStreak}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="opacity-60">VS THE BOOKIE</span>
              <b>{marginLine}</b>
            </div>
            {profile.edgeVsMarket !== null ? (
              <div className="flex items-baseline justify-between">
                <span className="opacity-60">EDGE VS MARKET</span>
                <span>{formatEdgePct(profile.edgeVsMarket)}</span>
              </div>
            ) : null}
            <PaperRule />
            <div className="text-center tracking-[0.14em] opacity-60">SETTLED CALLS ONLY</div>
          </div>
          <div className="receipt-perforation-bottom" aria-hidden />
        </div>

        <div className="mt-3.5">
          <Button
            variant="primary"
            onClick={() => {
              void handleShare();
            }}
          >
            {isCopied ? 'Copied' : 'Share my card'}
          </Button>
        </div>
      </div>
    </Tray>
  );
}
