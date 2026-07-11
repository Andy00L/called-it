'use client';

import type { LivePayload } from '@calledit/contracts';
import { Card, Tray } from '../ui/surface';
import { Eyebrow } from '../ui/eyebrow';
import { ScoreContent } from './score-card';
import { PitchView } from './pitch-view';

/**
 * The match cockpit (screen 01): score, market pulse, the pressure pitch, and
 * the sponsor board stacked in ONE card so they read together with minimal
 * scroll. The pitch reduces to a slim band via the header toggle, bringing the
 * calls into view; on desktop the cockpit sits beside the deck.
 */
export function MatchCockpit({
  payload,
  participant1,
  participant2,
  startTimeMs,
  displayClockSeconds,
  connectionLost,
  pitchReduced,
  onTogglePitch,
  sponsor,
}: {
  payload: LivePayload;
  participant1: string;
  participant2: string;
  startTimeMs: number;
  displayClockSeconds: number;
  connectionLost: boolean;
  pitchReduced: boolean;
  onTogglePitch: () => void;
  /** Match sponsor wordmark for the pitchside board; undefined hides it. */
  sponsor: string | undefined;
}) {
  return (
    <Tray className="p-2">
      <Card className="overflow-hidden">
        <div className="px-5 pb-4 pt-5">
          <ScoreContent
            payload={payload}
            participant1={participant1}
            participant2={participant2}
            startTimeMs={startTimeMs}
            displayClockSeconds={displayClockSeconds}
          />
        </div>

        <div className="rule-dashed px-4 pb-2 pt-2.5">
          <div className="mb-1 flex items-center justify-between gap-2.5">
            <Eyebrow>Live pitch</Eyebrow>
            <button
              type="button"
              onClick={onTogglePitch}
              aria-expanded={!pitchReduced}
              aria-label={pitchReduced ? 'Expand the pitch' : 'Reduce the pitch'}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-chip border border-hairline px-2.5 text-xs font-medium text-ink-muted transition-transform duration-[var(--duration-micro)] ease-[var(--ease-standard)] active:scale-[0.97]"
            >
              {pitchReduced ? 'Expand' : 'Reduce'}
              <svg
                width="11"
                height="11"
                viewBox="0 0 12 12"
                fill="none"
                aria-hidden
                className={`transition-transform duration-[var(--duration-small)] ease-[var(--ease-standard)] ${
                  pitchReduced ? '' : 'rotate-180'
                }`}
              >
                <path
                  d="M2.5 4.5L6 8l3.5-3.5"
                  stroke="var(--ink-muted)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
          <PitchView
            momentum={payload.momentum}
            matchResult={payload.matchResult}
            participant1={participant1}
            participant2={participant2}
            phase={payload.phase}
            reduced={pitchReduced}
            connectionLost={connectionLost}
          />
        </div>

        {sponsor !== undefined ? (
          <div className="rule-dashed flex items-center justify-center gap-2.5 px-4 py-2.5">
            <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted">
              Match presented by
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="size-1 rounded-full bg-accent" />
              <span className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-ink">
                {sponsor}
              </span>
            </span>
          </div>
        ) : null}
      </Card>
    </Tray>
  );
}
