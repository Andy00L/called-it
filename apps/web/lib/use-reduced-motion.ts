'use client';

import { useEffect, useState } from 'react';

/**
 * Reactive prefers-reduced-motion flag. The pressure pitch's JS-driven motion
 * (the ball roll, speed trail, and motion blur) reads this to stay off when
 * the viewer asks for less motion; the CSS animations are already neutralized
 * globally in globals.css. Returns false on the server and first paint, then
 * syncs on mount so hydration stays stable.
 */
export function usePrefersReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') {
      return;
    }
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReduced(query.matches);
    const handleChange = (event: MediaQueryListEvent): void => {
      setPrefersReduced(event.matches);
    };
    query.addEventListener('change', handleChange);
    return () => query.removeEventListener('change', handleChange);
  }, []);

  return prefersReduced;
}
