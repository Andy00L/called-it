/** Display formatting rules: numbers mono and tabular, dates locale-aware. */

/** Match clock as football minutes: 2700 s -> 45'. */
export function formatClockMinutes(clockSeconds: number): string {
  return `${Math.floor(clockSeconds / 60)}'`;
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

/** Points with digit grouping: 1250 -> "1,250" (locale-aware). */
export function formatPoints(points: number): string {
  return new Intl.NumberFormat(undefined).format(points);
}
