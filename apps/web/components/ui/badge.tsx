import type { ReactNode } from 'react';

type BadgeTone = 'live' | 'neutral' | 'finished' | 'streak';

const TONE_CLASSES: Record<BadgeTone, string> = {
  live: 'bg-accent/15 text-accent border-accent/40',
  neutral: 'bg-transparent text-ink-muted border-line',
  finished: 'bg-transparent text-ink-muted border-line',
  streak: 'bg-streak/15 text-streak border-streak/40',
};

/** Uppercase eyebrow pill; the only sanctioned uppercase (sheet, type). */
export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-chip border px-2 py-0.5 text-xs uppercase tracking-[0.08em] ${TONE_CLASSES[tone]}`}
    >
      {tone === 'live' ? (
        <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-accent" />
      ) : null}
      {children}
    </span>
  );
}
