'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  MatchSquadsPayload,
  PlayerActionEntry,
} from '@calledit/contracts';
import { formatClockMinutes } from '../../lib/format';
import { PLAYER_ACTION_LABEL, shortSurname } from '../../lib/squad';
import { BallGlyph } from './squad-layer';

/**
 * The attributed-moment flash (screen 07): when the feed attributes a fresh
 * moment to a player (goal, card, sub, injury), one toast rides the pitch's
 * bottom edge with the minute, the glyph, and the name, then recedes. A
 * substitution pair collapses into one "X on, Y off" line. Only moments
 * arriving AFTER mount flash; opening a match mid-game replays nothing.
 */

const FLASH_VISIBLE_MS = 5000;

interface FlashContent {
  key: number;
  minute: string;
  label: string;
  name: string;
  kind: PlayerActionEntry['kind'];
  onInk: boolean;
}

function playerName(squads: MatchSquadsPayload, action: PlayerActionEntry): string {
  const squad = action.team === 'p2' ? squads.p2 : squads.p1;
  const found = squad?.players.find((player) => player.playerId === action.playerId);
  return found === undefined ? '' : shortSurname(found.name);
}

function teamNameOf(squads: MatchSquadsPayload, action: PlayerActionEntry): string {
  const squad = action.team === 'p2' ? squads.p2 : squads.p1;
  return squad?.teamName ?? '';
}

export function ActionFlash({
  playerActions,
  squads,
}: {
  playerActions: PlayerActionEntry[];
  squads: MatchSquadsPayload;
}) {
  const [flash, setFlash] = useState<FlashContent | null>(null);
  const seenCountRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Mount baseline: everything already in the list is history, not news.
    if (seenCountRef.current === null) {
      seenCountRef.current = playerActions.length;
      return;
    }
    if (playerActions.length <= seenCountRef.current) {
      seenCountRef.current = Math.min(seenCountRef.current, playerActions.length);
      return;
    }
    const fresh = playerActions.slice(seenCountRef.current);
    seenCountRef.current = playerActions.length;
    const latest = fresh[fresh.length - 1];
    if (latest === undefined) {
      return;
    }
    let content: FlashContent;
    const baseKey = Date.now();
    if (latest.kind === 'sub_on' || latest.kind === 'sub_off') {
      const pair = fresh.filter(
        (action) =>
          (action.kind === 'sub_on' || action.kind === 'sub_off') &&
          action.clockSeconds === latest.clockSeconds,
      );
      const onAction = pair.find((action) => action.kind === 'sub_on') ?? latest;
      const offAction = pair.find((action) => action.kind === 'sub_off');
      const onName = playerName(squads, onAction);
      const offName = offAction === undefined ? '' : playerName(squads, offAction);
      content = {
        key: baseKey,
        minute: formatClockMinutes(latest.clockSeconds),
        label: 'Substitution',
        name: `${onName} on${offName !== '' ? `, ${offName} off` : ''} · ${teamNameOf(squads, onAction)}`,
        kind: 'sub_on',
        onInk: false,
      };
    } else {
      content = {
        key: baseKey,
        minute: formatClockMinutes(latest.clockSeconds),
        label: PLAYER_ACTION_LABEL[latest.kind],
        name: `${playerName(squads, latest)} · ${teamNameOf(squads, latest)}`,
        kind: latest.kind,
        onInk: latest.kind === 'goal',
      };
    }
    setFlash(content);
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => setFlash(null), FLASH_VISIBLE_MS);
  }, [playerActions, squads]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    },
    [],
  );

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none absolute bottom-3 left-1/2 z-[6] max-w-[94%] -translate-x-1/2"
    >
      {flash !== null ? (
        <div
          key={flash.key}
          className={`flex items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-card border px-3.5 py-2 [animation:toast-in_var(--duration-standard)_var(--ease-enter)_both] [box-shadow:var(--shadow-float)] ${
            flash.onInk ? 'border-ink bg-ink text-cream' : 'border-hairline bg-card text-ink'
          }`}
        >
          <span
            className={`tabular font-mono text-xs font-semibold ${flash.onInk ? 'text-[#3FBF54]' : 'text-accent-deep'}`}
          >
            {flash.minute}
          </span>
          {flash.kind === 'goal' ? <BallGlyph size={12} /> : null}
          {flash.kind === 'yellow_card' ? (
            <span aria-hidden className="h-[11px] w-2 rounded-[1px] bg-[#B8A014]" />
          ) : null}
          {flash.kind === 'red_card' ? (
            <span aria-hidden className="h-[11px] w-2 rounded-[1px] bg-miss" />
          ) : null}
          {flash.kind === 'sub_on' ? (
            <span aria-hidden className="flex items-center gap-0.5">
              <svg width="7" height="5" viewBox="0 0 7 5">
                <path d="M0 5h7L3.5 0z" fill="var(--accent-deep)" />
              </svg>
              <svg width="7" height="5" viewBox="0 0 7 5">
                <path d="M0 0h7L3.5 5z" fill="var(--ink-muted)" />
              </svg>
            </span>
          ) : null}
          <span
            className={`text-xs font-semibold uppercase tracking-[0.14em] ${
              flash.onInk ? 'text-cream' : 'text-ink-muted'
            }`}
          >
            {flash.label}
          </span>
          <span className="overflow-hidden text-ellipsis text-sm font-medium">{flash.name}</span>
        </div>
      ) : null}
    </div>
  );
}
