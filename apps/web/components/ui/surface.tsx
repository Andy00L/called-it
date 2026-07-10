import type { ReactNode } from 'react';

/**
 * The one material of the product (sheet, "Material and depth"): a soft
 * inset tray holding flat white cards. Trays never nest; cards inside a
 * tray cast no shadow.
 */
export function Tray({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`tray ${className}`}>{children}</div>;
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`card ${className}`}>{children}</div>;
}
