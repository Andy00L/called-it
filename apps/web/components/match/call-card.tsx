import type { CallOption } from '@calledit/contracts';
import { Surface } from '../ui/surface';
import { formatPoints, formatProbability } from '../../lib/format';

/**
 * One offerable call. Display-only for now: the lock action lands with the
 * guest-player flow (next milestone); no dead buttons in the meantime.
 */
export function CallCard({ option }: { option: CallOption }) {
  return (
    <Surface className="flex items-center justify-between gap-3 p-4">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-sm font-semibold">{option.label}</span>
        <span className="text-xs text-ink-muted">
          market says{' '}
          <span className="tabular font-mono text-ink">
            {formatProbability(option.probabilityFraction)}
          </span>
          {option.pricingSource === 'model' ? ' (model priced)' : ''}
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-end">
        <span className="tabular font-mono text-xl font-semibold text-accent">
          +{formatPoints(option.potentialPoints)}
        </span>
        <span className="text-xs uppercase tracking-[0.08em] text-ink-faint">pts</span>
      </div>
    </Surface>
  );
}
