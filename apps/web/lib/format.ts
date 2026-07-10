/** Display formatting rules: numbers mono and tabular, dates locale-aware. */

/** Match clock as football minutes: 2700 s -> 45'. */
export function formatClockMinutes(clockSeconds: number): string {
  return `${Math.floor(clockSeconds / 60)}'`;
}

/** Match clock as m:ss for the score card: 3792 s -> 63:12. */
export function formatClockMmSs(clockSeconds: number): string {
  const minutes = Math.floor(clockSeconds / 60);
  const seconds = String(clockSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

/** Market probability fraction as a percent with one decimal: 0.124 -> 12.4%. */
export function formatProbability(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

/** Kickoff time in the viewer's locale and timezone. */
export function formatKickoff(startTimeMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(startTimeMs));
}

/** Kickoff as a bare clock time for the score card: 21:00. */
export function formatKickoffClock(startTimeMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(startTimeMs));
}

/** Points with digit grouping: 1250 -> "1,250" (locale-aware). */
export function formatPoints(points: number): string {
  return new Intl.NumberFormat(undefined).format(points);
}

/** Streak multiplier for display: 1.21 -> "x1.2". */
export function formatMultiplier(multiplier: number): string {
  return `x${multiplier.toFixed(1)}`;
}

/**
 * Short team tag for the event feed column: "Argentina" -> "ARG". A display
 * derivation only; the feed carries participant indexes, not codes.
 */
export function teamTag(teamName: string): string {
  return teamName.replaceAll(/[^\p{L}]/gu, '').slice(0, 3).toUpperCase();
}
