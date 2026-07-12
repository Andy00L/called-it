'use client';

import { useEffect, useRef } from 'react';
import type {
  MatchPlayerStatsPayload,
  PitchTeam,
  PlayerActionEntry,
  SquadPlayerEntry,
  TeamSquadPayload,
} from '@calledit/contracts';
import { formatClockMinutes } from '../../lib/format';
import {
  ageFromDateOfBirth,
  jerseyStyleFor,
  PLAYER_ACTION_LABEL,
  statsForPlayer,
  timelineForPlayer,
} from '../../lib/squad';
import { BallGlyph } from './squad-layer';

/**
 * The live player card (screen 07): identity, live counters, and the
 * attributed timeline, rebuilt from the feed's own moments. The honesty
 * footnote states the attribution limit instead of hiding it: the feed
 * attributes goals, cards, subs, and injuries; nothing else is claimed.
 */

const GROUP_WORD: Record<SquadPlayerEntry['positionGroup'], string> = {
  gk: 'goalkeeper',
  def: 'defender',
  mid: 'midfielder',
  fwd: 'forward',
  unknown: 'player',
};

function StatCell({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <span className="tabular block font-mono text-[22px] font-semibold">{value}</span>
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
        {label}
      </span>
    </div>
  );
}

export function PlayerCard({
  player,
  squad,
  side,
  playerStats,
  playerActions,
  onClose,
}: {
  player: SquadPlayerEntry;
  squad: TeamSquadPayload;
  side: PitchTeam;
  playerStats: MatchPlayerStatsPayload | null;
  playerActions: PlayerActionEntry[];
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // The card is a small dialog: focus lands on close, Escape dismisses.
  useEffect(() => {
    closeRef.current?.focus();
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const jersey = jerseyStyleFor(squad.jerseyColor, side);
  const stats = statsForPlayer(playerStats, side, player.playerId);
  const timeline = timelineForPlayer(playerActions, player.playerId);
  const age = ageFromDateOfBirth(player.dateOfBirth, Date.now());

  return (
    <div
      role="dialog"
      aria-label={`Player card, ${player.name}`}
      className="absolute inset-y-0 right-0 z-[5] w-[300px] max-w-[82%] overflow-y-auto rounded-card border border-hairline bg-card p-4 [animation:player-in_var(--duration-standard)_var(--ease-enter)_both]"
    >
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Close player card"
        className="absolute right-0 top-0 flex size-11 items-center justify-center border-0 bg-transparent p-0 active:scale-[0.97]"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <path d="M3 3l8 8M11 3l-8 8" stroke="var(--ink)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      <div className="flex items-center gap-2.5 pr-9">
        <span
          className="tabular box-border flex size-9 flex-none items-center justify-center rounded-full border border-[rgba(18,23,15,0.25)] font-mono text-[13px] font-semibold [box-shadow:inset_0_0_0_1px_rgba(255,255,255,0.9)]"
          style={{ background: jersey.fill, color: jersey.numberColor }}
        >
          {player.number ?? ''}
        </span>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-base font-medium tracking-[-0.01em]">{player.name}</p>
          <p className="m-0 mt-0.5 text-xs text-ink-muted">
            {player.number !== null ? `No ${player.number}, ` : ''}
            {GROUP_WORD[player.positionGroup]}, {squad.teamName}
          </p>
        </div>
        {age !== null ? (
          <span className="tabular flex-none font-mono text-xs text-ink">{age} yrs</span>
        ) : null}
      </div>

      <div className="rule-dashed my-3" />

      <div className="grid grid-cols-3 gap-2 text-center">
        <StatCell value={stats.goals} label="Goals" />
        <StatCell value={stats.yellowCards} label="Yellow" />
        <StatCell value={stats.redCards} label="Red" />
      </div>

      <div className="rule-dashed my-3" />

      {timeline.length > 0 ? (
        <div>
          {timeline.map((action, index) => (
            <div
              key={`${action.kind}-${action.clockSeconds}-${index}`}
              className={`flex items-baseline gap-2.5 py-1.5 ${index === 0 ? '' : 'rule-dashed'}`}
            >
              <span className="tabular w-8 flex-none font-mono text-xs text-accent-deep">
                {formatClockMinutes(action.clockSeconds)}
              </span>
              <span className="text-sm text-ink">{PLAYER_ACTION_LABEL[action.kind]}</span>
              {action.kind === 'goal' ? <BallGlyph size={11} /> : null}
            </div>
          ))}
        </div>
      ) : (
        <div>
          <p className="m-0 text-sm text-ink-muted">No attributed actions yet.</p>
          <p className="m-0 mt-2 text-[11px] text-ink-faint">
            The feed attributes goals, cards, subs and injuries. Nothing else is claimed.
          </p>
        </div>
      )}
    </div>
  );
}
