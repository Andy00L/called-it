'use client';

import type { CallOption } from '@calledit/contracts';
import { Button } from '../ui/button';
import { Eyebrow } from '../ui/eyebrow';
import { formatClockMinutes, formatPoints, formatProbability } from '../../lib/format';

// sourceRef: apps/worker/src/game.ts MIN_WINDOW_REMAINING_SECONDS; the
// worker refuses locks under this margin, so the card disables first.
const WINDOW_CLOSING_SECONDS = 120;

export interface LockedView {
  lockClockSeconds: number;
}

function windowEndClockSeconds(option: CallOption): number | null {
  return option.predicate.kind === 'event_window' ? option.predicate.toClockSeconds : null;
}

/**
 * One offerable call (screen 01): category eyebrow, the claim, the market
 * price, the points, and the square lock button. Rows are separated by
 * dashed hairlines in the parent card.
 */
export function CallCard({
  option,
  clockSeconds,
  locked,
  isLocking,
  lockError,
  justLocked,
  enterDelayMs,
  onLock,
}: {
  option: CallOption;
  clockSeconds: number;
  locked: LockedView | undefined;
  isLocking: boolean;
  lockError: string | undefined;
  /** True right after a successful lock: plays the punch + ring flash. */
  justLocked: boolean;
  enterDelayMs: number;
  onLock: (option: CallOption) => void;
}) {
  const windowEnd = windowEndClockSeconds(option);
  const isClosing =
    locked === undefined && windowEnd !== null && windowEnd - clockSeconds < WINDOW_CLOSING_SECONDS;
  const isOffered = locked === undefined && !isClosing;
  const inkClass = isClosing ? 'text-ink-faint' : 'text-ink';

  return (
    <article
      className="[animation:deck-in_var(--duration-standard)_var(--ease-enter)_both]"
      style={{ animationDelay: `${enterDelayMs}ms` }}
    >
      <div
        className={`flex justify-between gap-4 rounded-[6px] p-4 sm:px-4.5 ${
          justLocked
            ? '[animation:punch-card_var(--duration-small)_var(--ease-standard),ring-flash_320ms_var(--ease-exit)]'
            : ''
        }`}
      >
        <div className="min-w-0">
          <Eyebrow size="sm" tone={isClosing ? 'faint' : 'default'}>
            {option.category}
          </Eyebrow>
          <h3 className={`mb-1 mt-1.5 text-[17px] font-medium tracking-[-0.01em] ${inkClass}`}>
            {option.label}
          </h3>
          <p className={`text-[13px] ${isClosing ? 'text-ink-faint' : 'text-ink-muted'}`}>
            {option.pricingSource === 'market' ? 'market says' : 'model says'}{' '}
            <span className={`tabular font-mono ${inkClass}`}>
              {formatProbability(option.probabilityFraction)}
            </span>
          </p>
          {lockError !== undefined ? (
            <p role="alert" className="mt-1.5 text-xs text-miss">
              {lockError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-none flex-col items-end justify-between gap-2.5">
          <span
            className={`tabular font-mono text-xl font-semibold ${
              isClosing ? 'text-ink-faint' : 'text-accent'
            }`}
          >
            +{formatPoints(option.potentialPoints)}
          </span>
          {isOffered ? (
            <Button
              variant="primary"
              isLoading={isLocking}
              onClick={() => onLock(option)}
              aria-label={`Lock: ${option.label}`}
            >
              Lock it
            </Button>
          ) : (
            <Button variant="ghost" disabled aria-disabled>
              {locked !== undefined
                ? `Locked at ${formatClockMinutes(locked.lockClockSeconds)}`
                : 'Window closing'}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}
