import type { ReactNode } from 'react';

/**
 * The one card material of the product (sheet: "Material and depth").
 * Elevation carried by edges + layered shadow; never nested on itself.
 */
export function Surface({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-card border border-line bg-surface ${className}`}
      style={{ boxShadow: 'var(--card-shadow)' }}
    >
      {children}
    </div>
  );
}
