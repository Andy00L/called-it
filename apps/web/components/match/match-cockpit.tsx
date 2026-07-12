'use client';

import { useEffect, useRef, useState } from 'react';
import type { LivePayload, TeamSquadPayload } from '@calledit/contracts';
import { Card, Tray } from '../ui/surface';
import { Eyebrow } from '../ui/eyebrow';
import { teamTag } from '../../lib/format';
import { jerseyStyleFor } from '../../lib/squad';
import { ScoreContent } from './score-card';
import { PitchView } from './pitch-view';
import { ActionFlash } from './action-flash';
import { PlayerCard } from './player-card';
import { TeamStatsView } from './team-stats-view';
import { BenchColumn, SquadPitchLayer, type OpenPlayerRef } from './squad-layer';

/**
 * The match cockpit (screen 01 + the screen 07 layers): score, market pulse,
 * the pressure pitch with the kickoff XI riding it, the benches, the player
 * card, the team stats view, and the sponsor board, stacked in ONE card. When
 * the feed serves no lineups (an old tape), every XI surface stays absent and
 * the cockpit is exactly the momentum cockpit.
 */

// The XI shows at kickoff, then recedes to Momentum on its own; the toggle
// brings it back anytime (accepted screen 07 export).
const XI_AUTO_RECEDE_MS = 6000;

interface PresentSquads {
  p1: TeamSquadPayload;
  p2: TeamSquadPayload;
}

function presentSquads(payload: LivePayload): PresentSquads | null {
  const squads = payload.squads;
  if (squads === null || squads.p1 === null || squads.p2 === null) {
    return null;
  }
  return { p1: squads.p1, p2: squads.p2 };
}

function SegmentButton({
  label,
  pressed,
  onPick,
  withDivider,
}: {
  label: string;
  pressed: boolean;
  onPick: () => void;
  withDivider?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={pressed}
      className={`min-h-[34px] border-0 px-2.5 text-xs font-medium transition-colors duration-[var(--duration-small)] ease-[var(--ease-standard)] active:scale-[0.97] ${
        withDivider ? 'border-l border-solid border-l-hairline' : ''
      } ${pressed ? 'bg-accent-soft text-accent-deep' : 'bg-transparent text-ink-muted'}`}
    >
      {label}
    </button>
  );
}

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
  const squads = presentSquads(payload);
  const xiAvailable = squads !== null;

  const [xiOn, setXiOn] = useState(false);
  const [openPlayer, setOpenPlayer] = useState<OpenPlayerRef | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const userChoseLayerRef = useRef(false);
  const recedeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousPhaseRef = useRef(payload.phase);
  const xiShownOnceRef = useRef(false);

  const showXiThenRecede = (): void => {
    setXiOn(true);
    if (recedeTimerRef.current !== null) {
      clearTimeout(recedeTimerRef.current);
    }
    recedeTimerRef.current = setTimeout(() => {
      if (!userChoseLayerRef.current) {
        setXiOn(false);
      }
    }, XI_AUTO_RECEDE_MS);
  };

  // Kickoff beat: the XI presents itself once when the lineups are in and the
  // match is not over, and again when the phase flips to live while watching.
  useEffect(() => {
    const kickedOff = previousPhaseRef.current === 'pre' && payload.phase === 'live';
    previousPhaseRef.current = payload.phase;
    if (!xiAvailable || payload.phase === 'finished') {
      return;
    }
    if (!xiShownOnceRef.current || kickedOff) {
      xiShownOnceRef.current = true;
      showXiThenRecede();
    }
  }, [xiAvailable, payload.phase]);

  useEffect(
    () => () => {
      if (recedeTimerRef.current !== null) {
        clearTimeout(recedeTimerRef.current);
      }
    },
    [],
  );

  const pickLayer = (nextXiOn: boolean): void => {
    userChoseLayerRef.current = true;
    if (recedeTimerRef.current !== null) {
      clearTimeout(recedeTimerRef.current);
    }
    setXiOn(nextXiOn);
  };

  const openPlayerEntry =
    squads !== null && openPlayer !== null
      ? {
          squad: openPlayer.side === 'p1' ? squads.p1 : squads.p2,
          player: (openPlayer.side === 'p1' ? squads.p1 : squads.p2).players.find(
            (candidate) => candidate.playerId === openPlayer.playerId,
          ),
        }
      : null;

  const xiActive = xiAvailable && xiOn && !pitchReduced;

  // Jersey tint for the momentum ball and halo: only when the feed served a
  // shirt color, so an old tape keeps the neutral printed ball.
  const p1Jersey = payload.squads?.p1?.jerseyColor
    ? jerseyStyleFor(payload.squads.p1.jerseyColor, 'p1')
    : null;
  const p2Jersey = payload.squads?.p2?.jerseyColor
    ? jerseyStyleFor(payload.squads.p2.jerseyColor, 'p2')
    : null;

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
          <div className="mb-1 flex flex-wrap items-center justify-between gap-2.5">
            <Eyebrow>Live pitch</Eyebrow>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {xiAvailable && !pitchReduced ? (
                <div
                  role="group"
                  aria-label="Pitch layer"
                  className="flex overflow-hidden rounded-chip border border-hairline"
                >
                  <SegmentButton label="Onze" pressed={xiOn} onPick={() => pickLayer(true)} />
                  <SegmentButton
                    label="Momentum"
                    pressed={!xiOn}
                    onPick={() => pickLayer(false)}
                    withDivider
                  />
                </div>
              ) : null}
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
          </div>

          <div className="relative">
            <div className="flex items-stretch gap-2">
              {xiAvailable && !pitchReduced && squads !== null ? (
                <div className="hidden sm:flex">
                  <BenchColumn
                    squad={squads.p1}
                    side="p1"
                    teamTagText={teamTag(squads.p1.teamName)}
                    playerActions={payload.playerActions}
                    onOpenPlayer={setOpenPlayer}
                  />
                </div>
              ) : null}

              <div className="relative min-w-0 flex-1">
                <PitchView
                  momentum={payload.momentum}
                  matchResult={payload.matchResult}
                  participant1={participant1}
                  participant2={participant2}
                  phase={payload.phase}
                  reduced={pitchReduced}
                  connectionLost={connectionLost}
                  heroHidden={xiActive}
                  captionOverride={xiActive ? 'Lineups by position group' : undefined}
                  p1Jersey={p1Jersey}
                  p2Jersey={p2Jersey}
                />
                {xiActive && squads !== null ? (
                  <SquadPitchLayer
                    squads={squads}
                    playerStats={payload.playerStats}
                    playerActions={payload.playerActions}
                    onOpenPlayer={setOpenPlayer}
                  />
                ) : null}
                {squads !== null ? (
                  <ActionFlash playerActions={payload.playerActions} squads={squads} />
                ) : null}
              </div>

              {xiAvailable && !pitchReduced && squads !== null ? (
                <div className="hidden sm:flex">
                  <BenchColumn
                    squad={squads.p2}
                    side="p2"
                    teamTagText={teamTag(squads.p2.teamName)}
                    playerActions={payload.playerActions}
                    onOpenPlayer={setOpenPlayer}
                  />
                </div>
              ) : null}
            </div>

            {xiAvailable && !pitchReduced && squads !== null ? (
              <div className="mt-2 flex flex-col gap-1.5 sm:hidden">
                <BenchColumn
                  squad={squads.p1}
                  side="p1"
                  teamTagText={teamTag(squads.p1.teamName)}
                  playerActions={payload.playerActions}
                  onOpenPlayer={setOpenPlayer}
                  orientation="row"
                />
                <BenchColumn
                  squad={squads.p2}
                  side="p2"
                  teamTagText={teamTag(squads.p2.teamName)}
                  playerActions={payload.playerActions}
                  onOpenPlayer={setOpenPlayer}
                  orientation="row"
                />
              </div>
            ) : null}

            {openPlayerEntry !== null &&
            openPlayerEntry.player !== undefined &&
            openPlayer !== null ? (
              <PlayerCard
                player={openPlayerEntry.player}
                squad={openPlayerEntry.squad}
                side={openPlayer.side}
                playerStats={payload.playerStats}
                playerActions={payload.playerActions}
                onClose={() => setOpenPlayer(null)}
              />
            ) : null}
          </div>

          {xiAvailable ? (
            <button
              type="button"
              onClick={() => setStatsOpen(true)}
              className="rule-dashed -mx-4 mt-2 flex min-h-10 w-[calc(100%+32px)] items-center justify-center gap-2 border-0 bg-transparent text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted active:scale-[0.97]"
            >
              <span aria-hidden className="text-[9px] text-accent">
                &#9656;
              </span>
              Team stats
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden>
                <path
                  d="M4.5 2.5L8 6l-3.5 3.5"
                  stroke="var(--ink-muted)"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          ) : null}
        </div>

        {sponsor !== undefined ? (
          <div className="rule-dashed flex flex-col items-center gap-1 px-4 py-2.5">
            <div className="flex items-center justify-center gap-2.5">
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
            {/* The sponsored-jackpot ad unit, shown as a sample slot (see
                docs/TECH_DOC.md: prize-indemnity precedent). No real prize. */}
            <p className="text-center font-mono text-[10px] uppercase tracking-[0.14em] text-ink-muted">
              Sample slot: 3 hits in one half enters the {sponsor} draw
            </p>
          </div>
        ) : null}
      </Card>

      {statsOpen && squads !== null ? (
        <TeamStatsView
          squads={squads}
          playerStats={payload.playerStats}
          goalsP1={payload.goalsP1}
          goalsP2={payload.goalsP2}
          onClose={() => setStatsOpen(false)}
        />
      ) : null}
    </Tray>
  );
}
