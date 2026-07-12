'use client';

import type {
  MatchPlayerStatsPayload,
  PitchTeam,
  PlayerActionEntry,
  SquadPlayerEntry,
  SquadPositionGroup,
  TeamSquadPayload,
} from '@calledit/contracts';
import {
  jerseyStyleFor,
  placementOf,
  shortSurname,
  statsForPlayer,
  wasSubbedOff,
} from '../../lib/squad';

/**
 * The kickoff XI layer and the bench columns (screen 07). Chips sit on the
 * printed pitch in honest POSITION-GROUP lines (GK / DEF / MID / FWD from the
 * feed), evenly spaced, never a tactical formation. A substitution recomposes
 * the lines; a red card grays the player in place. Every chip opens the
 * player card.
 */

// Group line positions as % of the pitch width, home side; away mirrors
// (sourceRef: the accepted screen 07 export's column map over the 340x200
// pitch viewBox).
const GROUP_LEFT_PCT: Record<Exclude<SquadPositionGroup, 'unknown'>, number> = {
  gk: 8.5,
  def: 20.5,
  mid: 32.5,
  fwd: 44.5,
};

// Vertical spread matches the SVG field band (y 14..186 of 200).
const FIELD_TOP = 14;
const FIELD_HEIGHT = 172;
const VIEWBOX_HEIGHT = 200;

const GROUP_ORDER: SquadPositionGroup[] = ['gk', 'def', 'mid', 'fwd'];

const GROUP_WORD: Record<SquadPositionGroup, string> = {
  gk: 'goalkeeper',
  def: 'defender',
  mid: 'midfielder',
  fwd: 'forward',
  unknown: 'player',
};

export interface OpenPlayerRef {
  side: PitchTeam;
  playerId: number;
}

interface PlacedChip {
  player: SquadPlayerEntry;
  side: PitchTeam;
  leftPct: number;
  topPct: number;
  sentOff: boolean;
  enterDelayMs: number;
}

/** Place one team's on-pitch players on their group lines. */
function placeTeam(
  squad: TeamSquadPayload,
  side: PitchTeam,
  playerActions: PlayerActionEntry[],
): PlacedChip[] {
  const chips: PlacedChip[] = [];
  const byGroup = new Map<SquadPositionGroup, { player: SquadPlayerEntry; sentOff: boolean }[]>();
  for (const player of squad.players) {
    const placement = placementOf(player, playerActions);
    if (placement === 'bench') {
      continue;
    }
    // 'unknown' groups render on the midfield line rather than nowhere.
    const group = player.positionGroup === 'unknown' ? 'mid' : player.positionGroup;
    const line = byGroup.get(group) ?? [];
    line.push({ player, sentOff: placement === 'pitch_sent_off' });
    byGroup.set(group, line);
  }
  for (const [groupIndex, group] of GROUP_ORDER.entries()) {
    const line = byGroup.get(group) ?? [];
    for (const [lineIndex, placed] of line.entries()) {
      const homeLeft = GROUP_LEFT_PCT[group as Exclude<SquadPositionGroup, 'unknown'>];
      chips.push({
        player: placed.player,
        side,
        leftPct: side === 'p1' ? homeLeft : 100 - homeLeft,
        topPct:
          ((FIELD_TOP + (FIELD_HEIGHT * (lineIndex + 1)) / (line.length + 1)) / VIEWBOX_HEIGHT) *
          100,
        sentOff: placed.sentOff,
        enterDelayMs: (side === 'p1' ? 0 : 150) + groupIndex * 40,
      });
    }
  }
  return chips;
}

function StatBadges({
  goals,
  yellowCards,
  redCards,
}: {
  goals: number;
  yellowCards: number;
  redCards: number;
}) {
  if (goals === 0 && yellowCards === 0 && redCards === 0) {
    return null;
  }
  return (
    <span aria-hidden className="flex gap-px [animation:chip-in_var(--duration-small)_var(--ease-enter)_both]">
      {goals > 0 ? <BallGlyph size={10} /> : null}
      {yellowCards > 0 ? <span className="h-[9px] w-[7px] rounded-[1px] bg-[#B8A014]" /> : null}
      {redCards > 0 ? <span className="h-[9px] w-[7px] rounded-[1px] bg-miss" /> : null}
    </span>
  );
}

export function BallGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden>
      <circle cx="5" cy="5" r="4.3" fill="#FFFFFF" stroke="#12170F" strokeWidth="0.9" />
      <path d="M5 3.1l1.8 1.3-.7 2.1H3.9l-.7-2.1z" fill="#12170F" />
    </svg>
  );
}

/** All on-pitch chips of both teams, over the full pitch. */
export function SquadPitchLayer({
  squads,
  playerStats,
  playerActions,
  onOpenPlayer,
}: {
  squads: { p1: TeamSquadPayload; p2: TeamSquadPayload };
  playerStats: MatchPlayerStatsPayload | null;
  playerActions: PlayerActionEntry[];
  onOpenPlayer: (ref: OpenPlayerRef) => void;
}) {
  const chips = [
    ...placeTeam(squads.p1, 'p1', playerActions),
    ...placeTeam(squads.p2, 'p2', playerActions),
  ];
  return (
    <div className="absolute inset-0">
      {chips.map((chip) => {
        const squad = chip.side === 'p1' ? squads.p1 : squads.p2;
        const jersey = jerseyStyleFor(squad.jerseyColor, chip.side);
        const stats = statsForPlayer(playerStats, chip.side, chip.player.playerId);
        // DEF and FWD lines carry the name above the chip so neighbouring
        // lines never overlap labels (the accepted export's alternation).
        const labelUp = chip.player.positionGroup === 'def' || chip.player.positionGroup === 'fwd';
        return (
          <button
            key={`${chip.side}-${chip.player.playerId}`}
            type="button"
            onClick={() => onOpenPlayer({ side: chip.side, playerId: chip.player.playerId })}
            aria-label={`${chip.player.name}, ${squad.teamName} ${chip.player.number ?? ''}, ${GROUP_WORD[chip.player.positionGroup]}${chip.sentOff ? ', sent off' : ''}`}
            className={`absolute -ml-[22px] -mt-[22px] flex size-11 items-center justify-center rounded-full border-0 bg-transparent p-0 [animation:chip-in_var(--duration-standard)_var(--ease-enter)_both] active:scale-[0.97] ${
              chip.sentOff ? 'opacity-40 grayscale' : ''
            }`}
            style={{
              left: `${chip.leftPct.toFixed(1)}%`,
              top: `${chip.topPct.toFixed(1)}%`,
              animationDelay: `${chip.enterDelayMs}ms`,
            }}
          >
            <span className="relative flex flex-col items-center transition-transform duration-[var(--duration-small)] ease-[var(--ease-standard)] hover:-translate-y-0.5">
              <span
                className="tabular box-border flex size-7 items-center justify-center rounded-full border border-[rgba(18,23,15,0.25)] font-mono text-[11px] font-semibold [box-shadow:inset_0_0_0_1px_rgba(255,255,255,0.9)]"
                style={{ background: jersey.fill, color: jersey.numberColor }}
              >
                {chip.player.number ?? ''}
              </span>
              <span
                className="whitespace-nowrap text-[9px] text-[rgba(18,23,15,0.7)] [text-shadow:0_0_2px_var(--cream),0_0_2px_var(--cream),0_0_3px_var(--cream)]"
                style={{ order: labelUp ? -1 : 1, margin: '1px 0' }}
              >
                {shortSurname(chip.player.name)}
              </span>
              <span
                className="absolute left-[19px] flex"
                style={{ top: labelUp ? 8 : -4 }}
              >
                <StatBadges
                  goals={stats.goals}
                  yellowCards={stats.yellowCards}
                  redCards={stats.redCards}
                />
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * One team's bench: a slim column outside the pitch's long edge on desktop,
 * a horizontal strip under the pitch on mobile (orientation 'row').
 */
export function BenchColumn({
  squad,
  side,
  teamTagText,
  playerActions,
  onOpenPlayer,
  orientation = 'column',
}: {
  squad: TeamSquadPayload;
  side: PitchTeam;
  teamTagText: string;
  playerActions: PlayerActionEntry[];
  onOpenPlayer: (ref: OpenPlayerRef) => void;
  orientation?: 'column' | 'row';
}) {
  const jersey = jerseyStyleFor(squad.jerseyColor, side);
  const neverCameOn = squad.players.filter(
    (player) => placementOf(player, playerActions) === 'bench' && !wasSubbedOff(playerActions, player.playerId),
  );
  const cameOff = squad.players.filter(
    (player) =>
      placementOf(player, playerActions) === 'bench' && wasSubbedOff(playerActions, player.playerId),
  );
  const rows = [
    ...neverCameOn.map((player) => ({ player, off: false })),
    ...cameOff.map((player) => ({ player, off: true })),
  ];
  if (rows.length === 0) {
    return null;
  }
  const surfaceClasses =
    orientation === 'column'
      ? 'flex max-h-[248px] w-11 flex-none flex-col items-center gap-[3px] overflow-y-auto py-1.5'
      : 'scrollbar-none flex max-w-full items-center gap-1 overflow-x-auto px-2 py-1';
  return (
    <div
      aria-label={`${squad.teamName} bench`}
      className={`${surfaceClasses} rounded-card bg-soft [box-shadow:inset_0_0_6px_0_rgba(18,23,15,0.16)]`}
    >
      <span className="flex-none font-mono text-[9px] tracking-[0.1em] text-ink-faint">
        {teamTagText}
      </span>
      {rows.map(({ player, off }) => (
        <button
          key={player.playerId}
          type="button"
          onClick={() => onOpenPlayer({ side, playerId: player.playerId })}
          aria-label={`${player.name}, bench, ${squad.teamName}${off ? ', subbed off' : ''}`}
          className={`flex h-[26px] w-9 flex-none flex-col items-center justify-center border-0 bg-transparent p-0 active:scale-[0.97] ${
            off ? 'opacity-60' : ''
          }`}
        >
          <span
            className="tabular box-border flex size-[22px] items-center justify-center rounded-full border border-[rgba(18,23,15,0.2)] font-mono text-[10px] font-semibold"
            style={{ background: jersey.fill, color: jersey.numberColor, opacity: 0.85 }}
          >
            {player.number ?? ''}
          </span>
          {off ? (
            <svg width="7" height="5" viewBox="0 0 7 5" aria-hidden>
              <path d="M0 0h7L3.5 5z" fill="var(--ink-muted)" />
            </svg>
          ) : null}
        </button>
      ))}
    </div>
  );
}
