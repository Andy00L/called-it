'use client';

import type { CallOption, PickStatus } from '@calledit/contracts';
import { Surface } from '../ui/surface';
import { Button } from '../ui/button';
import { formatClockMinutes, formatPoints, formatProbability } from '../../lib/format';

export interface MyPickView {
  status: PickStatus;
  pointsAwarded: number | null;
  lockProbabilityFraction: number;
  lockClockSeconds: number;
  bookieClaim: string | null;
}

function OutcomeChip({ myPick }: { myPick: MyPickView }) {
  if (myPick.status === 'hit') {
    return (
      <span className="tabular font-mono text-xl font-semibold text-accent">
        +{formatPoints(myPick.pointsAwarded ?? 0)}
      </span>
    );
  }
  if (myPick.status === 'miss') {
    return <span className="font-mono text-sm font-semibold text-miss">missed</span>;
  }
  return (
    <span className="text-xs uppercase tracking-[0.08em] text-ink-muted">settling live</span>
  );
}

/** One offerable call: lock it, then watch it settle in place. */
export function CallCard({
  option,
  myPick,
  isLocking,
  lockError,
  onLock,
}: {
  option: CallOption;
  myPick: MyPickView | undefined;
  isLocking: boolean;
  lockError: string | undefined;
  onLock: (option: CallOption) => void;
}) {
  return (
    <Surface className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
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
        <div className="flex shrink-0 flex-col items-end gap-1">
          {myPick === undefined ? (
            <>
              <span className="tabular font-mono text-xl font-semibold text-accent">
                +{formatPoints(option.potentialPoints)}
              </span>
              <Button
                variant="primary"
                isLoading={isLocking}
                onClick={() => onLock(option)}
                aria-label={`Lock: ${option.label}`}
              >
                Lock it
              </Button>
            </>
          ) : (
            <OutcomeChip myPick={myPick} />
          )}
        </div>
      </div>

      {myPick !== undefined ? (
        <div className="flex flex-col gap-1 border-t border-line pt-2 text-xs text-ink-muted">
          <span>
            locked {formatClockMinutes(myPick.lockClockSeconds)} at{' '}
            <span className="tabular font-mono">
              {formatProbability(myPick.lockProbabilityFraction)}
            </span>
          </span>
          {myPick.bookieClaim !== null ? (
            <span>The Bookie countered: {myPick.bookieClaim}</span>
          ) : null}
        </div>
      ) : null}

      {lockError !== undefined ? (
        <p role="alert" className="text-xs text-miss">
          {lockError}
        </p>
      ) : null}
    </Surface>
  );
}
