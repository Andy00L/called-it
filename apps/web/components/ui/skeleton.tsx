/** Loading placeholder that mirrors final layout (no layout shift on resolve). */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-chip bg-line ${className}`} />;
}
