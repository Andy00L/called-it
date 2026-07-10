/**
 * Letterpress button recipe (sheet): deliberately square (radius 0),
 * ringed, press scale 0.97. Pure class strings so server components can
 * style link-shaped actions; the interactive Button lives in button.tsx.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

const BASE_CLASSES =
  'inline-flex min-h-10 items-center justify-center gap-2 rounded-none px-4.5 text-sm font-medium transition-transform duration-[var(--duration-micro)] ease-[var(--ease-standard)] active:scale-[0.97] disabled:cursor-not-allowed disabled:active:scale-100';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-white [box-shadow:var(--shadow-btn-primary)] disabled:opacity-75',
  secondary: 'bg-ink text-white [box-shadow:var(--shadow-btn-secondary)] disabled:opacity-75',
  ghost:
    'border border-hairline bg-transparent text-ink disabled:border-hairline disabled:text-ink-muted',
};

/** Same recipe for link-shaped actions (Next Link styled as a button). */
export function buttonClassName(variant: ButtonVariant, extra = ''): string {
  return `${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${extra}`;
}
