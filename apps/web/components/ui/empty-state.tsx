import type { ReactNode } from 'react';

/** Designed empty/error block: one line of copy, one optional action. */
export function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line px-6 py-12 text-center">
      <p className="text-base font-semibold text-ink">{title}</p>
      <p className="max-w-sm text-sm text-ink-muted">{detail}</p>
      {action}
    </div>
  );
}
