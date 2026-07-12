'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { DangerLevel, MatchResultProbabilities, PitchMomentum } from '@calledit/contracts';
import { favoredSide } from './probability-pulse';
import { usePrefersReducedMotion } from '../../lib/use-reduced-motion';
import { isLightJersey, type JerseyStyle } from '../../lib/squad';

/**
 * The pressure pitch (signature element): a printed, top-down pitch that reacts
 * live to the feed with NO video. It is an HONEST momentum abstraction, never
 * positional tracking: the halo of pressure sits where the danger is, and the
 * hero object, a printed matchday football, rolls along ONE horizontal line as
 * momentum shifts (its vertical position carries no data). When it travels it
 * rolls, trails, motion-blurs, and stretches its contact shadow; at rest it is
 * still. The pitch shows full or, when the cockpit is collapsed, a slim band.
 *
 * Geometry, in SVG user units. p1 attacks toward the right.
 */
const FIELD_LEFT = 14;
const FIELD_WIDTH = 312;
const CENTER_X = 170;

// The printed ball is authored at r=11; the band renders it smaller by scale.
const BALL_AUTHOR_RADIUS = 11;

// The roll, trail, and blur play for one travel step (the ball token is 250ms;
// clear a hair later so the settle reads before the effects drop).
const MOVE_SETTLE_MS = 260;

type PitchTeam = 'p1' | 'p2';
type PitchEvent = NonNullable<PitchMomentum['lastEvent']>;

const DANGER_WORD: Record<DangerLevel, string> = {
  safe: 'in control',
  attack: 'building',
  danger: 'threatening',
  high_danger: 'high danger',
};

function teamName(
  team: PitchTeam | null,
  participant1: string,
  participant2: string,
): string | null {
  if (team === 'p1') {
    return participant1;
  }
  if (team === 'p2') {
    return participant2;
  }
  return null;
}

/** Attacking-third x for a team's events and pre-signals (null rests center). */
function attackingX(team: PitchTeam | null): number {
  if (team === 'p1') {
    return 292;
  }
  if (team === 'p2') {
    return 48;
  }
  return CENTER_X;
}

function captionFor(
  momentum: PitchMomentum,
  matchResult: MatchResultProbabilities | null,
  participant1: string,
  participant2: string,
  phase: 'pre' | 'live' | 'finished',
): string {
  if (phase === 'finished') {
    return 'Full time';
  }
  const name = teamName(momentum.possessingTeam, participant1, participant2);
  if (name !== null && momentum.dangerLevel !== null) {
    return `${name} ${DANGER_WORD[momentum.dangerLevel]}`;
  }
  if (matchResult !== null) {
    const favored = favoredSide(matchResult);
    if (favored === 'draw') {
      return 'Momentum even';
    }
    const favName = favored === 'p1' ? participant1 : participant2;
    return `${favName} favoured`;
  }
  return phase === 'pre' ? 'Awaiting kick-off' : 'Reading the game';
}

interface BallMotion {
  rotationDeg: number;
  direction: 1 | -1;
  isMoving: boolean;
}

/**
 * Track the ball's rolling motion from its horizontal position. Rotation
 * accumulates in proportion to distance travelled (a real roll), direction
 * follows travel, and a short "moving" window drives the trail and blur.
 * Under reduced motion it snaps: no roll, no transit state.
 */
function useBallMotion(ballX: number, reducedMotion: boolean): BallMotion {
  const [motion, setMotion] = useState<BallMotion>({
    rotationDeg: 0,
    direction: 1,
    isMoving: false,
  });
  const previousXRef = useRef(ballX);
  const rotationRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const delta = ballX - previousXRef.current;
    previousXRef.current = ballX;
    if (Math.abs(delta) < 0.01) {
      return;
    }
    if (reducedMotion) {
      setMotion((current) => ({ ...current, isMoving: false }));
      return;
    }
    const direction: 1 | -1 = delta > 0 ? 1 : -1;
    rotationRef.current += (delta / (2 * Math.PI * BALL_AUTHOR_RADIUS)) * 360;
    setMotion({ rotationDeg: rotationRef.current, direction, isMoving: true });
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      setMotion((current) => ({ ...current, isMoving: false }));
    }, MOVE_SETTLE_MS);
  }, [ballX, reducedMotion]);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    },
    [],
  );

  return motion;
}

/**
 * Surface only fresh events (those arriving after mount), so opening a match
 * mid-game does not replay a stale burst or throw confetti on load. The ref
 * captures the mount-time event id (or null when the match has none yet);
 * anything with a different id afterwards is fresh, including the match's
 * very first event.
 */
function useFreshEvent(lastEvent: PitchEvent | null): PitchEvent | null {
  const [fresh, setFresh] = useState<PitchEvent | null>(null);
  const seenIdRef = useRef<number | null>(lastEvent?.id ?? null);

  useEffect(() => {
    if (lastEvent === null || lastEvent.id === seenIdRef.current) {
      return;
    }
    seenIdRef.current = lastEvent.id;
    setFresh(lastEvent);
  }, [lastEvent]);

  return fresh;
}

/**
 * The printed football, authored centered at (0,0), radius 11. Its base wears
 * the possessing team's jersey color and its seams the contrast tone, so the
 * ball reads as "who has it"; the base fill eases between team colors on a
 * possession switch.
 */
function DetailedBall({ baseColor, inkColor }: { baseColor: string; inkColor: string }) {
  return (
    <>
      <circle
        r={BALL_AUTHOR_RADIUS}
        fill={baseColor}
        style={{ transition: 'fill var(--duration-standard) var(--ease-standard)' }}
      />
      <circle r={BALL_AUTHOR_RADIUS} fill="url(#pitchTopLight)" />
      <polygon points="0,-3.2 3.04,-0.99 1.88,2.59 -1.88,2.59 -3.04,-0.99" fill={inkColor} />
      <path
        d="M0,-3.2 L0,-10.4 M3.04,-0.99 L9.9,-3.22 M1.88,2.59 L6.1,8.4 M-1.88,2.59 L-6.1,8.4 M-3.04,-0.99 L-9.9,-3.22"
        stroke={inkColor}
        strokeWidth={1}
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M-2.1,-9.7 L0,-10.6 L2.1,-9.7 M8.7,-5 L9.95,-3.2 L9,-1.1"
        stroke={inkColor}
        strokeWidth={0.8}
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle r={BALL_AUTHOR_RADIUS} fill="none" stroke={inkColor} strokeWidth={1} />
    </>
  );
}

function GoalBurst({
  team,
  centerY,
  sizeFactor,
}: {
  team: PitchTeam | null;
  centerY: number;
  sizeFactor: number;
}) {
  const centerX = attackingX(team);
  return (
    <g transform={`translate(${centerX} ${centerY}) scale(${sizeFactor})`}>
      <circle r={11} fill="var(--accent)" className="goal-wave" />
      <circle r={12} fill="none" stroke="var(--accent)" strokeWidth={2.4} className="goal-ring-snap" />
      <circle r={6} fill="var(--accent)" className="goal-core" />
      <title>Goal</title>
    </g>
  );
}

/**
 * One placed event bursting on the pitch. Positions derive from the render
 * mode: the full pitch centers on y=100, the reduced band on y=32, and the
 * corner flag pins to the band's own top edge.
 */
function EventBurst({
  event,
  centerY,
  reduced,
}: {
  event: PitchEvent;
  centerY: number;
  reduced: boolean;
}) {
  const centerX = attackingX(event.team);
  if (event.kind === 'goal') {
    return <GoalBurst team={event.team} centerY={centerY} sizeFactor={reduced ? 0.72 : 1} />;
  }
  if (event.kind === 'corner') {
    // A corner flag at the attacking side's top corner. Accent-deep keeps the
    // amber streak color reserved for streaks (design system coherence).
    const flagX = event.team === 'p2' ? FIELD_LEFT + 4 : FIELD_LEFT + FIELD_WIDTH - 4;
    const flagTop = reduced ? 12 : 24;
    const flagBottom = reduced ? 26 : 42;
    const pennant = reduced ? { run: 6.5, rise: 2.2 } : { run: 9, rise: 3 };
    return (
      <g className="pitch-pop">
        <line
          x1={flagX}
          y1={flagTop}
          x2={flagX}
          y2={flagBottom}
          stroke="var(--accent-deep)"
          strokeWidth={1.6}
        />
        <path
          d={
            event.team === 'p2'
              ? `M${flagX} ${flagTop} l${pennant.run} ${pennant.rise} l-${pennant.run} ${pennant.rise} z`
              : `M${flagX} ${flagTop} l-${pennant.run} ${pennant.rise} l${pennant.run} ${pennant.rise} z`
          }
          fill="var(--accent-deep)"
        />
        <title>Corner</title>
      </g>
    );
  }
  return (
    <g className="pitch-pop">
      <rect
        x={centerX - 3.5}
        y={centerY - 5}
        width={7}
        height={10}
        rx={1.2}
        fill="var(--ink-muted)"
        transform={`rotate(8 ${centerX} ${centerY})`}
      />
      <title>Card</title>
    </g>
  );
}

const CONFETTI_COLORS = [
  'var(--accent)',
  'var(--accent)',
  'var(--accent-deep)',
  'var(--ink)',
  'var(--accent-soft)',
  'var(--ink-faint)',
  'var(--card)',
];

interface ConfettiPiece {
  key: string;
  style: CSSProperties;
}

function makeConfetti(seed: number): ConfettiPiece[] {
  const pieces: ConfettiPiece[] = [];
  for (let index = 0; index < 26; index += 1) {
    const isDisc = Math.random() < 0.26;
    const width = isDisc ? 6 + Math.random() * 4 : 4 + Math.random() * 3;
    const height = isDisc ? width : 9 + Math.random() * 7;
    const left = 68 + (Math.random() * 28 - 14);
    const top = 44 + (Math.random() * 18 - 9);
    const travelX = Math.random() * 300 - 150;
    const peakY = -(50 + Math.random() * 90);
    const fallY = 90 + Math.random() * 150;
    const spin = Math.random() * 900 - 450;
    const duration = 1150 + Math.random() * 650;
    const delay = Math.random() * 130;
    const color =
      CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)] ?? 'var(--accent)';
    const style: Record<string, string> = {
      position: 'absolute',
      left: `${left.toFixed(1)}%`,
      top: `${top.toFixed(1)}%`,
      width: `${width.toFixed(1)}px`,
      height: `${height.toFixed(1)}px`,
      background: color,
      borderRadius: isDisc ? '50%' : '1px',
      '--tx': `${travelX.toFixed(0)}px`,
      '--peak': `${peakY.toFixed(0)}px`,
      '--ty': `${fallY.toFixed(0)}px`,
      '--rot': `${spin.toFixed(0)}deg`,
      animation: `confetti-fly ${duration.toFixed(0)}ms cubic-bezier(0.22,0.61,0.36,1) ${delay.toFixed(0)}ms both`,
    };
    pieces.push({ key: `${seed}-${index}`, style: style as CSSProperties });
  }
  return pieces;
}

/** The one loud beat: confetti and a "Goal" stamp, on a fresh goal only. */
function GoalCelebration({ eventId, scorer }: { eventId: number; scorer: string }) {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setPieces(makeConfetti(eventId));
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 1500);
    return () => clearTimeout(timer);
  }, [eventId]);

  if (!visible) {
    return null;
  }
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((piece) => (
        <div key={piece.key} style={piece.style} />
      ))}
      <div className="absolute left-1/2 top-[40%] whitespace-nowrap text-[38px] font-semibold tracking-[-0.03em] text-accent-deep [animation:goal-stamp_1500ms_var(--ease-enter)_both] [text-shadow:0_1px_0_rgba(255,255,255,0.65)]">
        {scorer} goal
      </div>
    </div>
  );
}

export function PitchView({
  momentum,
  matchResult,
  participant1,
  participant2,
  phase,
  reduced = false,
  connectionLost = false,
  heroHidden = false,
  captionOverride,
  p1Jersey = null,
  p2Jersey = null,
}: {
  momentum: PitchMomentum;
  matchResult: MatchResultProbabilities | null;
  participant1: string;
  participant2: string;
  phase: 'pre' | 'live' | 'finished';
  /** Collapsed cockpit: render the slim band instead of the full pitch. */
  reduced?: boolean;
  connectionLost?: boolean;
  /** XI layer active: the momentum ball rests so the chips own the pitch. */
  heroHidden?: boolean;
  /** XI layer active: the caption states the position-group honesty rule. */
  captionOverride?: string;
  /** Jersey styles for the possessing-team ball/halo tint; null keeps neutral. */
  p1Jersey?: JerseyStyle | null;
  p2Jersey?: JerseyStyle | null;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const ballX = FIELD_LEFT + momentum.ballAdvance * FIELD_WIDTH;
  const motion = useBallMotion(ballX, reducedMotion);
  const freshEvent = useFreshEvent(momentum.lastEvent);

  // A dropped feed freezes the pitch; reduced motion stills it too.
  const still = reducedMotion || connectionLost;
  const moving = motion.isMoving && !still;

  // The ball wears the possessing team's jersey color, and the halo follows.
  // A light jersey (white, yellow) would vanish on the pale pitch, so the halo
  // falls back to the accent for those while the ball keeps the real color.
  // Possession TYPE stays encoded by the halo's size and breathing, unchanged.
  const possessingJersey =
    momentum.possessingTeam === 'p1'
      ? p1Jersey
      : momentum.possessingTeam === 'p2'
        ? p2Jersey
        : null;
  const ballBase = possessingJersey?.fill ?? 'var(--card)';
  const ballInk = possessingJersey?.numberColor ?? 'var(--ink)';
  const haloColor =
    possessingJersey !== null && !isLightJersey(possessingJersey.fill)
      ? possessingJersey.fill
      : 'var(--accent)';

  const centerY = reduced ? 32 : 100;
  const ballScale = reduced ? 8 / BALL_AUTHOR_RADIUS : 1;
  const haloRadius = (reduced ? 18 : 30) + momentum.intensity * (reduced ? 16 : 34);
  const haloOpacity = 0.14 + momentum.intensity * 0.5;
  const isHot = momentum.dangerLevel === 'high_danger';
  const shadowRx = reduced ? 8 : 11;
  const shadowRy = reduced ? 2.6 : 3.4;
  const shadowCy = reduced ? 7.6 : 10;
  const trailRadius = reduced ? 8 : 11;
  const trailOffsets = reduced ? [6, 12, 18] : [9, 18, 27];
  const trailOpacities = [0.16, 0.1, 0.05];

  const caption = captionFor(momentum, matchResult, participant1, participant2, phase);
  const pendingTeamName =
    momentum.pendingSignal !== null
      ? teamName(momentum.pendingSignal.team, participant1, participant2)
      : null;

  const goalEvent =
    freshEvent !== null && freshEvent.kind === 'goal' && phase !== 'pre' ? freshEvent : null;
  const scorerName =
    goalEvent !== null
      ? (teamName(goalEvent.team, participant1, participant2) ?? 'A')
      : null;
  const displayCaption =
    goalEvent !== null && scorerName !== null
      ? `${scorerName} goal`
      : (captionOverride ?? caption);
  const showCelebration = goalEvent !== null && scorerName !== null && !reduced && !still;

  const outerStyle: CSSProperties = {
    transform: `translate(${ballX}px, ${centerY}px)`,
    transition: `transform var(--duration-standard) var(--ease-standard)`,
  };
  const rollStyle: CSSProperties = {
    transformBox: 'fill-box',
    transformOrigin: 'center',
    transform: `rotate(${motion.rotationDeg.toFixed(1)}deg)`,
    filter: moving ? 'blur(2px)' : 'blur(0px)',
    transition: `transform var(--duration-standard) var(--ease-standard), filter var(--duration-small) var(--ease-exit)`,
  };
  const shadowStyle: CSSProperties = {
    transformBox: 'fill-box',
    transformOrigin: 'center',
    transform: moving ? `scaleX(1.6) translateX(${-motion.direction * 3}px)` : 'scaleX(1)',
    opacity: moving ? 0.7 : 1,
    transition: `transform var(--duration-standard) var(--ease-standard), opacity var(--duration-small) var(--ease-exit)`,
  };

  const captionLine = (
    <>
      <span>{displayCaption}</span>
      {phase === 'live' ? (
        <>
          <span aria-hidden className="text-ink-faint">
            -
          </span>
          <span className="text-ink-faint">live, no video</span>
        </>
      ) : null}
    </>
  );

  return (
    <figure
      className={`relative m-0 transition-opacity duration-[var(--duration-standard)] ${
        connectionLost ? 'opacity-50' : 'opacity-100'
      }`}
    >
      <svg
        // Remount on mode switch: the persistent group would otherwise
        // transition translate() across the viewBox swap, sliding the ball
        // vertically (a fake vertical signal). Instant swap + a small
        // fade-rise instead; ball motion state lives above and survives.
        key={reduced ? 'band' : 'full'}
        viewBox={reduced ? '0 0 340 64' : '0 0 340 200'}
        role="img"
        aria-label={`Pressure pitch, live from the feed. ${displayCaption}.`}
        className="w-full [animation:chip-in_var(--duration-small)_var(--ease-enter)_both]"
      >
        <defs>
          <radialGradient id="pitchTopLight" cx="35%" cy="30%" r="72%">
            <stop offset="0%" stopColor="var(--card)" stopOpacity={1} />
            <stop offset="100%" stopColor="var(--ink)" stopOpacity={0.06} />
          </radialGradient>
          <radialGradient id="pitchHalo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={haloColor} stopOpacity={0.9} />
            <stop offset="65%" stopColor={haloColor} stopOpacity={0.28} />
            <stop offset="100%" stopColor={haloColor} stopOpacity={0} />
          </radialGradient>
          <radialGradient id="pitchBallShadow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--ink)" stopOpacity={0.2} />
            <stop offset="70%" stopColor="var(--ink)" stopOpacity={0.12} />
            <stop offset="100%" stopColor="var(--ink)" stopOpacity={0} />
          </radialGradient>
        </defs>

        {/* Printed pitch markings, hairline on a faint accent field. */}
        {reduced ? (
          <g stroke="var(--hairline)" strokeWidth={1} fill="none">
            <rect x={FIELD_LEFT} y={8} width={FIELD_WIDTH} height={48} rx={6} fill="var(--accent-soft)" />
            <line x1={CENTER_X} y1={8} x2={CENTER_X} y2={56} />
          </g>
        ) : (
          <>
            <g stroke="var(--hairline)" strokeWidth={1} fill="none">
              <rect x={FIELD_LEFT} y={14} width={FIELD_WIDTH} height={172} rx={8} fill="var(--accent-soft)" />
              <line x1={CENTER_X} y1={14} x2={CENTER_X} y2={186} />
              <circle cx={CENTER_X} cy={100} r={26} />
              <rect x={FIELD_LEFT} y={54} width={46} height={92} />
              <rect x={FIELD_LEFT + FIELD_WIDTH - 46} y={54} width={46} height={92} />
            </g>
            <g fill="var(--ink-faint)" stroke="none">
              <circle cx={CENTER_X} cy={100} r={1.6} />
              <rect x={8} y={86} width={6} height={28} rx={1} />
              <rect x={326} y={86} width={6} height={28} rx={1} />
            </g>
          </>
        )}

        {/* Pre-event shimmer: the anticipation beat, before the event lands. */}
        {momentum.pendingSignal !== null && !still ? (
          <circle
            cx={attackingX(momentum.pendingSignal.team)}
            cy={centerY}
            r={reduced ? 12 : 16}
            fill="none"
            stroke="var(--accent-deep)"
            strokeWidth={1.6}
            strokeDasharray="3 4"
            className="pitch-shimmer"
          >
            <title>
              {`${pendingTeamName !== null ? `${pendingTeamName} ` : ''}${momentum.pendingSignal.kind} looks on`}
            </title>
          </circle>
        ) : null}

        {/* Event burst, keyed by the event id so it plays exactly once. */}
        {freshEvent !== null && phase !== 'pre' ? (
          <EventBurst key={freshEvent.id} event={freshEvent} centerY={centerY} reduced={reduced} />
        ) : null}

        {/* Momentum: the hot-zone halo, trail, contact shadow, and the rolling
            printed ball, translated as one group along the pitch. Rests while
            the XI layer owns the pitch (heroHidden). */}
        <g style={outerStyle} display={heroHidden ? 'none' : undefined}>
          <circle
            cx={0}
            cy={0}
            r={haloRadius}
            fill="url(#pitchHalo)"
            className={isHot && !still ? 'halo-breath' : undefined}
            style={{
              opacity: isHot && !still ? undefined : haloOpacity,
              transition: `opacity var(--duration-standard) var(--ease-standard)`,
            }}
          />
          {trailOffsets.map((offset, index) => (
            <circle
              key={offset}
              cx={-motion.direction * offset}
              cy={0}
              r={trailRadius}
              fill="var(--ink)"
              style={{
                opacity: moving ? trailOpacities[index] : 0,
                transition: `opacity var(--duration-small) var(--ease-exit)`,
              }}
            />
          ))}
          <ellipse cx={0} cy={shadowCy} rx={shadowRx} ry={shadowRy} fill="url(#pitchBallShadow)" style={shadowStyle} />
          <g transform={`scale(${ballScale})`}>
            <g style={rollStyle}>
              <DetailedBall baseColor={ballBase} inkColor={ballInk} />
            </g>
          </g>
        </g>
      </svg>

      <figcaption className="tabular mt-2 flex items-center justify-center gap-2 text-center font-mono text-xs text-ink-muted">
        {captionLine}
      </figcaption>

      {showCelebration && goalEvent !== null && scorerName !== null ? (
        <GoalCelebration key={goalEvent.id} eventId={goalEvent.id} scorer={scorerName} />
      ) : null}
    </figure>
  );
}
