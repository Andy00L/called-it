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

/**
 * Programme paper inside a gilt frame (broadcast skin): the role tokens
 * remap to printed paper inside, so token-driven children render the light
 * programme on the night field. Interior padding stays with the children.
 */
export function PaperPanel({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`gilt-frame ${className}`}>
      <div className="gilt-frame-paper panel-paper overflow-hidden">{children}</div>
    </div>
  );
}
