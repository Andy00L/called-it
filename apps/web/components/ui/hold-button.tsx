'use client';

import { useEffect, useRef, useState } from 'react';
import { ButtonSpinner } from './button';
import { buttonClassName } from './button-styles';

/**
 * Press-and-hold confirm button (the lock gesture): holding fills the button
 * with the deep accent over the hold duration; releasing early cancels. The
 * deliberate press is the point (Clark et al. 2009: personally arranging the
 * call is the reward), and it kills accidental locks on a bouncing phone.
 * Keyboard and assistive tech activate instantly through click, so the hold
 * is never an accessibility gate.
 */

// Hold length: long enough to read as deliberate, short enough to stay snappy
// (under the 500 ms "slow" line of the motion sheet).
const DEFAULT_HOLD_MS = 500;

export function HoldButton({
  onComplete,
  isLoading = false,
  disabled = false,
  holdMs = DEFAULT_HOLD_MS,
  children,
  'aria-label': ariaLabel,
}: {
  onComplete: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  holdMs?: number;
  children: React.ReactNode;
  'aria-label'?: string;
}) {
  const [isHolding, setIsHolding] = useState(false);
  const holdTimerRef = useRef<number | null>(null);
  // True while a pointer interaction owns the button, so the click that the
  // browser fires after pointerup never double-triggers or re-triggers a
  // cancelled hold. Keyboard/AT activation arrives as a click with no prior
  // pointerdown and passes straight through.
  const pointerOwnedRef = useRef(false);

  // The timer must not fire after unmount (external system: the timer).
  useEffect(() => {
    return () => {
      if (holdTimerRef.current !== null) {
        window.clearTimeout(holdTimerRef.current);
      }
    };
  }, []);

  const cancelHoldTimer = (): void => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    setIsHolding(false);
  };

  const beginHold = (): void => {
    if (disabled || isLoading) {
      return;
    }
    pointerOwnedRef.current = true;
    setIsHolding(true);
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      setIsHolding(false);
      onComplete();
    }, holdMs);
  };

  const handleClick = (): void => {
    if (pointerOwnedRef.current) {
      pointerOwnedRef.current = false;
      return;
    }
    if (!disabled && !isLoading) {
      onComplete();
    }
  };

  return (
    <button
      type="button"
      disabled={disabled || isLoading}
      aria-label={ariaLabel}
      onPointerDown={(event) => {
        if (event.button === 0 || event.pointerType !== 'mouse') {
          beginHold();
        }
      }}
      onPointerUp={cancelHoldTimer}
      onPointerLeave={cancelHoldTimer}
      onPointerCancel={cancelHoldTimer}
      onContextMenu={(event) => {
        // A long touch press must fill the button, not open the menu.
        event.preventDefault();
      }}
      onClick={handleClick}
      className={buttonClassName('primary', 'relative touch-none select-none overflow-hidden')}
    >
      <span
        aria-hidden
        className="absolute inset-0 origin-left bg-accent-deep"
        style={{
          transform: isHolding ? 'scaleX(1)' : 'scaleX(0)',
          transition: isHolding
            ? `transform ${holdMs}ms linear`
            : 'transform var(--duration-small) var(--ease-exit)',
        }}
      />
      <span className="relative inline-flex items-center gap-1.5">
        {isLoading ? <ButtonSpinner /> : null}
        {children}
      </span>
    </button>
  );
}
