'use client';

import { useEffect, useState } from 'react';

// Count-up length: the standard token band's hero step (sheet, motion).
const COUNT_UP_MS = 400;

/**
 * Ease a number into place instead of bare-swapping it (sheet: numbers roll
 * or count up). Collapses to an instant set under prefers-reduced-motion.
 * useEffect is justified: requestAnimationFrame is an external system with
 * cancel-on-unmount cleanup.
 */
export function useCountUpNumber(target: number): number {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const prefersReduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setDisplayValue(target);
      return;
    }
    const startedAt = performance.now();
    let frame = 0;
    const step = (now: number): void => {
      const progress = Math.min(1, (now - startedAt) / COUNT_UP_MS);
      const eased = 1 - (1 - progress) ** 3;
      setDisplayValue(Math.round(target * eased));
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      }
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return displayValue;
}
