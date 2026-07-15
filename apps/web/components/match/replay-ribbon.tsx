'use client';

import { formatPoints } from '../../lib/format';

// sourceRef: apps/worker/src/replay.ts accepted speeds.
const REPLAY_SPEEDS = [1, 10, 60] as const;

/**
 * The Time Machine ribbon (screen 01, replay variant): amber dashed plate,
 * the one streak-color moment of the replay screen. Speed buttons are square
 * mono plates; the session score chip sits on cream.
 */
export function ReplayRibbon({
  speed,
  sessionPoints,
  onSpeed,
}: {
  speed: number;
  sessionPoints: number;
  onSpeed: (speed: number) => void;
}) {
  return (
    <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 rounded-chip border border-dashed [border-color:var(--streak-line)] [background:var(--streak-soft)] px-3.5 py-2.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-streak">
        Replay
      </span>
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Replay speed" className="flex">
          {REPLAY_SPEEDS.map((candidate) => {
            const isActive = candidate === speed;
            return (
              <button
                key={candidate}
                onClick={() => onSpeed(candidate)}
                aria-pressed={isActive}
                className={`tabular h-10 min-w-12 rounded-none font-mono text-[13px] transition-transform duration-[var(--duration-micro)] ease-[var(--ease-standard)] active:scale-[0.97] ${
                  isActive
                    ? 'bg-accent text-[var(--on-accent)] [box-shadow:0_0_0_1px_var(--accent-deep)_inset]'
                    : 'bg-card text-ink [box-shadow:0_0_0_1px_var(--hairline)_inset]'
                }`}
              >
                {candidate}x
              </button>
            );
          })}
        </div>
        <span className="tabular rounded-chip border border-dashed border-hairline bg-cream px-2 py-[5px] font-mono text-xs text-ink-muted">
          session {formatPoints(sessionPoints)} pts
        </span>
      </div>
      <span className="basis-full text-xs text-ink-muted">
        Replay calls never touch the leaderboard
      </span>
    </div>
  );
}
