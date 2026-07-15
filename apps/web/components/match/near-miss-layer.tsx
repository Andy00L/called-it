'use client';

import { useEffect, useState } from 'react';
import type { NearMissNotice } from '@calledit/contracts';
import { formatClockMinutes } from '../../lib/format';

/**
 * The honest near-miss toast: a missed window whose event landed just late
 * gets its factual margin, straight from the feed (never manufactured; the
 * grounding lives in docs/TECH_DOC.md). One notice at a time, newest first,
 * self-dismissing: the moment is an acknowledgement, not an interruption.
 */
const NEAR_MISS_TOAST_MS = 6000;

export function NearMissLayer({ notices }: { notices: NearMissNotice[] }) {
  const [dismissedPickIds, setDismissedPickIds] = useState<ReadonlySet<string>>(new Set());

  const active = notices.filter((notice) => !dismissedPickIds.has(notice.pickId)).at(-1);

  // One-shot timer per notice (external system: the timer), cleaned on change.
  useEffect(() => {
    if (active === undefined) {
      return;
    }
    const pickId = active.pickId;
    const timer = setTimeout(() => {
      setDismissedPickIds((previous) => new Set(previous).add(pickId));
    }, NEAR_MISS_TOAST_MS);
    return () => clearTimeout(timer);
  }, [active]);

  if (active === undefined) {
    return null;
  }

  return (
    <div
      role="status"
      className="fixed bottom-5 left-1/2 z-50 w-[340px] max-w-[calc(100vw-40px)] -translate-x-1/2 rounded-card bg-[var(--plate)] px-4 py-3.5 text-white [animation:toast-in_var(--duration-standard)_var(--ease-enter)_both] [box-shadow:var(--shadow-float)]"
    >
      <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
        So close
      </span>
      <p className="mt-1 text-sm font-medium">{active.claim}</p>
      <p className="mt-1 text-[13px] leading-normal text-white/70">
        The {active.category} came{' '}
        <span className="tabular font-mono font-semibold text-white">
          {formatClockMinutes(active.eventClockSeconds)}
        </span>
        . Your window closed{' '}
        <span className="tabular font-mono font-semibold text-white">
          {formatClockMinutes(active.windowEndClockSeconds)}
        </span>
        .
      </p>
    </div>
  );
}
