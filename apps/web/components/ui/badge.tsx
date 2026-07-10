import type { ReactNode } from 'react';

/**
 * Uppercase status chips (radius 4, sheet). live = accent-soft plate with a
 * pulsing dot; neutral = phase chips (kick-off, full time); replay = the
 * amber dashed plate (streak color, reserved); you = hairline accent chip.
 */
type BadgeTone = 'live' | 'neutral' | 'replay' | 'you';

const TONE_CLASSES: Record<BadgeTone, string> = {
  live: 'bg-accent-soft px-2.5 py-1 text-accent-deep',
  neutral: 'bg-soft px-2.5 py-1 text-ink-muted',
  replay:
    'border border-dashed [border-color:var(--streak-line)] [background:var(--streak-soft)] px-2 py-[3px] text-streak',
  you: 'border border-accent-line px-1.5 py-0.5 text-accent-deep',
};

export function Badge({
  tone,
  children,
  className = '',
}: {
  tone: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-chip text-[10px] font-semibold uppercase tracking-[0.14em] ${TONE_CLASSES[tone]} ${className}`}
    >
      {tone === 'live' ? (
        <span
          aria-hidden
          className="size-1.5 rounded-full bg-accent [animation:dot-pulse_2s_var(--ease-standard)_infinite]"
        />
      ) : null}
      {children}
    </span>
  );
}
