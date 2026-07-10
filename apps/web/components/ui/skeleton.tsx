/** Loading placeholder that mirrors final layout (no layout shift on resolve). */
export function Skeleton({
  className = '',
  tone = 'soft',
}: {
  className?: string;
  /** deep: for skeleton blocks sitting on the soft tray itself. */
  tone?: 'soft' | 'deep';
}) {
  return (
    <div
      aria-hidden
      className={`rounded-chip [animation:skeleton-pulse_1.6s_var(--ease-standard)_infinite] ${tone === 'deep' ? 'bg-skeleton-deep' : 'bg-soft'} ${className}`}
    />
  );
}
