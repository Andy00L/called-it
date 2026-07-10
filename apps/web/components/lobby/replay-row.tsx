'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ReplayTapeSummary } from '@calledit/contracts';
import { Badge } from '../ui/badge';
import { createReplaySession, REPLAY_FAILURE_COPY } from '../../lib/replay-api';

// The lobby promise ("Play it back at 10x"): sessions start at 10x.
const DEFAULT_REPLAY_SPEED = 10;

/** Tape date for the row note, locale-aware. */
function formatTapeDate(updatedAtMs: number): string {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
    new Date(updatedAtMs),
  );
}

/**
 * One finished match in "Replay them" (screen 02): the whole row starts a
 * Time Machine session and jumps into it.
 */
export function ReplayTapeRow({ tape }: { tape: ReplayTapeSummary }) {
  const router = useRouter();
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const handleStart = async (): Promise<void> => {
    if (isStarting) {
      return;
    }
    setIsStarting(true);
    setStartError(null);
    const created = await createReplaySession(tape.fixtureId, DEFAULT_REPLAY_SPEED);
    if (!created.ok) {
      setStartError(REPLAY_FAILURE_COPY[created.reason]);
      setIsStarting(false);
      return;
    }
    router.push(`/replay/${created.session.sessionId}`);
  };

  return (
    <button
      onClick={() => {
        void handleStart();
      }}
      disabled={isStarting}
      aria-label={`Replay ${tape.participant1} vs ${tape.participant2}`}
      className="block w-full cursor-pointer bg-card px-4 py-3.5 text-left text-ink transition-[transform,box-shadow] duration-[var(--duration-small)] ease-[var(--ease-standard)] hover:-translate-y-0.5 hover:[box-shadow:var(--shadow-float)] disabled:cursor-wait sm:px-4.5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3.5">
        <div className="min-w-0">
          <p className="truncate text-base font-medium tracking-[-0.01em]">
            {tape.participant2 === '' ? tape.participant1 : `${tape.participant1} vs ${tape.participant2}`}
          </p>
          <span className="tabular font-mono text-xs text-ink-muted">
            {tape.competition} · {formatTapeDate(tape.updatedAtMs)}
          </span>
        </div>
        <div className="flex flex-none items-center gap-3.5">
          {isStarting ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden
              className="animate-[spin-once_900ms_linear_infinite]"
            >
              <circle cx="7" cy="7" r="5.5" stroke="var(--hairline)" strokeWidth="1.6" />
              <path
                d="M7 1.5A5.5 5.5 0 0 1 12.5 7"
                stroke="var(--ink)"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          ) : null}
          <Badge tone="replay">Replay</Badge>
        </div>
      </div>
      {startError !== null ? (
        <p role="alert" className="mt-2 text-xs text-miss">
          {startError}
        </p>
      ) : null}
    </button>
  );
}
