import type { ReactNode } from 'react';

/**
 * Chevron-flanked uppercase label (sheet, type section): the one sanctioned
 * uppercase treatment for section headings and card categories.
 */
export function Eyebrow({
  children,
  size = 'md',
  tone = 'default',
  className = '',
}: {
  children: ReactNode;
  /** md: section heading (11px); sm: in-card category (10px). */
  size?: 'md' | 'sm';
  /** faint: disabled call cards only, never body text. */
  tone?: 'default' | 'faint';
  className?: string;
}) {
  const textClasses =
    size === 'md' ? 'gap-[7px] text-[11px]' : 'gap-1.5 text-[10px]';
  const chevronSize = size === 'md' ? 'text-[9px]' : 'text-[8px]';
  const inkClass = tone === 'faint' ? 'text-ink-faint' : 'text-ink-muted';
  const chevronClass = tone === 'faint' ? 'text-ink-faint' : 'text-accent';
  return (
    <span
      className={`inline-flex items-center font-semibold uppercase tracking-[0.14em] ${textClasses} ${inkClass} ${className}`}
    >
      <span aria-hidden className={`${chevronClass} ${chevronSize}`}>
        &#9656;
      </span>
      {children}
      <span aria-hidden className={`${chevronClass} ${chevronSize}`}>
        &#9666;
      </span>
    </span>
  );
}
