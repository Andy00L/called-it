'use client';

import { useEffect, useRef } from 'react';
import type {
  MatchPlayerStatsPayload,
  PitchTeam,
  SquadPlayerEntry,
  TeamSquadPayload,
} from '@calledit/contracts';
import { teamTag } from '../../lib/format';
import { jerseyStyleFor, statsForPlayer } from '../../lib/squad';

/**
 * The full-screen team stats view (screen 07): both squads as FIFA-style
 * roster rows with live counters, starters first (GK to FWD, the worker's
 * order) then the bench. A row with any stat is promoted on accent-soft.
 */

function BallMark({ scored }: { scored: boolean }) {
  const tone = scored ? 'var(--accent-deep)' : 'var(--ink-faint)';
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
      <circle cx="5" cy="5" r="4.3" fill="#FFFFFF" stroke={tone} strokeWidth="0.9" />
      <path d="M5 3.1l1.8 1.3-.7 2.1H3.9l-.7-2.1z" fill={tone} />
    </svg>
  );
}

function PlayerRow({
  player,
  squad,
  side,
  playerStats,
  isFirst,
}: {
  player: SquadPlayerEntry;
  squad: TeamSquadPayload;
  side: PitchTeam;
  playerStats: MatchPlayerStatsPayload | null;
  isFirst: boolean;
}) {
  const jersey = jerseyStyleFor(squad.jerseyColor, side);
  const stats = statsForPlayer(playerStats, side, player.playerId);
  const isHot = stats.goals + stats.yellowCards + stats.redCards > 0;
  return (
    <div className={isFirst ? '' : 'rule-dashed'}>
      <div
        className={`flex items-center gap-2.5 rounded-chip px-2.5 py-2 ${isHot ? 'bg-accent-soft' : ''}`}
      >
        <span
          aria-hidden
          className="box-border size-6 flex-none rounded-full border border-[rgba(18,23,15,0.2)] [box-shadow:inset_0_0_0_1px_rgba(255,255,255,0.9)]"
          style={{ background: jersey.fill }}
        />
        <span className="tabular w-5 flex-none text-right font-mono text-xs text-ink-muted">
          {player.number ?? ''}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm">{player.name}</span>
        <span className="w-[30px] flex-none text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
          {player.positionGroup === 'unknown' ? '' : player.positionGroup.toUpperCase()}
        </span>
        <span className="flex w-8 flex-none items-center justify-end gap-1">
          <BallMark scored={stats.goals > 0} />
          <span
            className={`tabular font-mono text-xs ${stats.goals > 0 ? 'text-ink' : 'text-ink-faint'}`}
          >
            {stats.goals}
          </span>
        </span>
        <span className="flex w-[26px] flex-none items-center justify-end gap-1">
          <span
            aria-hidden
            className="h-[9px] w-[7px] rounded-[1px] bg-[#B8A014]"
            style={{ opacity: stats.yellowCards > 0 ? 1 : 0.35 }}
          />
          <span
            className={`tabular font-mono text-xs ${stats.yellowCards > 0 ? 'text-ink' : 'text-ink-faint'}`}
          >
            {stats.yellowCards}
          </span>
        </span>
        <span className="flex w-[26px] flex-none items-center justify-end gap-1">
          <span
            aria-hidden
            className="h-[9px] w-[7px] rounded-[1px] bg-miss"
            style={{ opacity: stats.redCards > 0 ? 1 : 0.35 }}
          />
          <span
            className={`tabular font-mono text-xs ${stats.redCards > 0 ? 'text-ink' : 'text-ink-faint'}`}
          >
            {stats.redCards}
          </span>
        </span>
      </div>
    </div>
  );
}

function TeamSection({
  squad,
  side,
  goals,
  playerStats,
}: {
  squad: TeamSquadPayload;
  side: PitchTeam;
  goals: number;
  playerStats: MatchPlayerStatsPayload | null;
}) {
  const jersey = jerseyStyleFor(squad.jerseyColor, side);
  const starters = squad.players.filter((player) => player.starter);
  const bench = squad.players.filter((player) => !player.starter);
  return (
    <section aria-label={`${squad.teamName} stats`}>
      <div className="sticky top-0 z-[2] flex items-center gap-2 border-b border-dashed border-hairline bg-cream px-0.5 py-2.5">
        <span
          aria-hidden
          className="box-border size-3.5 rounded-full border border-[rgba(18,23,15,0.25)]"
          style={{ background: jersey.fill }}
        />
        <span className="flex-1 text-sm font-medium">{squad.teamName}</span>
        <span className="tabular font-mono text-sm font-semibold">{goals}</span>
      </div>
      <div className="tray mb-5 mt-2.5 p-2">
        <div className="rounded-card border border-hairline bg-card p-1">
          {starters.map((player, index) => (
            <PlayerRow
              key={player.playerId}
              player={player}
              squad={squad}
              side={side}
              playerStats={playerStats}
              isFirst={index === 0}
            />
          ))}
          {bench.length > 0 ? (
            <>
              <div className="rule-dashed px-2.5 pb-1 pt-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Bench
                </span>
              </div>
              {bench.map((player, index) => (
                <PlayerRow
                  key={player.playerId}
                  player={player}
                  squad={squad}
                  side={side}
                  playerStats={playerStats}
                  isFirst={index === 0}
                />
              ))}
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}

export function TeamStatsView({
  squads,
  playerStats,
  goalsP1,
  goalsP2,
  onClose,
}: {
  squads: { p1: TeamSquadPayload; p2: TeamSquadPayload };
  playerStats: MatchPlayerStatsPayload | null;
  goalsP1: number;
  goalsP2: number;
  onClose: () => void;
}) {
  const backRef = useRef<HTMLButtonElement | null>(null);

  // Focus lands on the back control ONCE, when the view opens. Keyed on
  // nothing: the parent recreates onClose on every SSE state frame, and
  // focus() scrolls its target into view, so keying this on onClose yanked
  // the viewport back to the top on every live tick.
  useEffect(() => {
    backRef.current?.focus();
  }, []);

  // Body scroll lock and Escape (external systems: document and keyboard).
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const scoreLine = `${teamTag(squads.p1.teamName)} ${goalsP1}-${goalsP2} ${teamTag(squads.p2.teamName)}`;

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Team stats"
      className="fixed inset-0 z-[60] overflow-y-auto bg-cream [animation:deck-in_var(--duration-standard)_var(--ease-enter)_both]"
    >
      <div className="mx-auto max-w-[640px] px-5 pb-15 pt-3 text-ink">
        <div className="flex items-center justify-between gap-3 pb-3.5 pt-1.5">
          <button
            ref={backRef}
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 items-center gap-2 border border-hairline bg-transparent px-3.5 text-sm font-medium text-ink active:scale-[0.97]"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M10 3L5 8l5 5"
                stroke="var(--ink)"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Back to the pitch
          </button>
          <span className="tabular font-mono text-base font-semibold">{scoreLine}</span>
        </div>

        <TeamSection squad={squads.p1} side="p1" goals={goalsP1} playerStats={playerStats} />
        <TeamSection squad={squads.p2} side="p2" goals={goalsP2} playerStats={playerStats} />
      </div>
    </div>
  );
}
