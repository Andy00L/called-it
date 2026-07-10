import type { ReactNode } from 'react';
import { Card } from './surface';

/**
 * Designed empty/error block (sheet, primitives): one motif, one sentence,
 * one action, on a flat white card. The corner-flag motif is the product's
 * empty-state mark; error is visually distinct (triangle, ink title).
 */
type EmptyMotif = 'flag' | 'ball' | 'error';

function FlagMotif() {
  return (
    <svg aria-hidden width="32" height="32" viewBox="0 0 32 32" fill="none">
      <path d="M9 27V5" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M9 5l13 4L9 13z" fill="var(--accent)" />
      <path
        d="M3 27c9 0 12-7 12-7"
        stroke="var(--ink-faint)"
        strokeWidth="1.2"
        strokeDasharray="3 3"
      />
    </svg>
  );
}

function BallMotif() {
  return (
    <svg aria-hidden width="32" height="32" viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="12" stroke="var(--ink)" strokeWidth="1.6" />
      <path d="M16 11.5l4.3 3.1-1.6 5h-5.4l-1.6-5z" fill="var(--accent)" />
      <path
        d="M16 4v7.5M27.4 12.6l-7.1 2M23.1 26l-4.4-6.4M8.9 26l4.4-6.4M4.6 12.6l7.1 2"
        stroke="var(--ink-faint)"
        strokeWidth="1.2"
        strokeDasharray="3 3"
      />
    </svg>
  );
}

function ErrorMotif() {
  return (
    <svg aria-hidden width="30" height="30" viewBox="0 0 30 30" fill="none">
      <path d="M15 4L28 26H2z" stroke="var(--miss)" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M15 12v6" stroke="var(--miss)" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="15" cy="22" r="1.2" fill="var(--miss)" />
    </svg>
  );
}

const MOTIFS: Record<EmptyMotif, () => ReactNode> = {
  flag: FlagMotif,
  ball: BallMotif,
  error: ErrorMotif,
};

export function EmptyState({
  title,
  motif = 'flag',
  action,
}: {
  title: string;
  motif?: EmptyMotif;
  action?: ReactNode;
}) {
  const Motif = MOTIFS[motif];
  return (
    <Card className="flex flex-col items-center gap-3 px-5 py-8 text-center">
      <Motif />
      <p className={motif === 'error' ? 'text-[15px] font-medium text-ink' : 'text-sm text-ink-muted'}>
        {title}
      </p>
      {action}
    </Card>
  );
}
