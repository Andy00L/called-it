import type { DangerLevel, MatchResultProbabilities, PitchMomentum } from '@calledit/contracts';
import { favoredSide } from './probability-pulse';

/**
 * The pressure pitch (signature element): a printed, top-down pitch that reacts
 * live to the feed with NO video. It is an honest momentum abstraction, never
 * positional tracking: the halo of pressure sits where the danger is (from
 * PossessionType, or the market tilt when no possession record is in), the ball
 * is a momentum needle at midfield height (we have no vertical data), events
 * burst on the attacking side, and a pre-event shimmer anticipates a signaled
 * corner/goal/penalty. One accent only; the side encodes which team.
 *
 * Geometry, in SVG user units (viewBox 340 x 200). p1 attacks toward the right.
 */
const FIELD_LEFT = 14;
const FIELD_WIDTH = 312;
const CENTER_X = 170;
const CENTER_Y = 100;

const DANGER_WORD: Record<DangerLevel, string> = {
  safe: 'in control',
  attack: 'building',
  danger: 'threatening',
  high_danger: 'high danger',
};

function teamName(
  team: 'p1' | 'p2' | null,
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
function attackingX(team: 'p1' | 'p2' | null): number {
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

function EventBurst({ kind, team }: { kind: 'goal' | 'corner' | 'card'; team: 'p1' | 'p2' | null }) {
  const centerX = attackingX(team);
  if (kind === 'goal') {
    return (
      <g className="pitch-pop">
        <circle cx={centerX} cy={CENTER_Y} r={7} fill="var(--accent)" />
        <circle
          cx={centerX}
          cy={CENTER_Y}
          r={14}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          opacity={0.55}
        />
        <title>Goal</title>
      </g>
    );
  }
  if (kind === 'corner') {
    // A corner flag at the attacking side's top corner. Accent-deep keeps the
    // amber streak color reserved for streaks (design system coherence).
    const flagX = team === 'p2' ? FIELD_LEFT + 4 : FIELD_LEFT + FIELD_WIDTH - 4;
    return (
      <g className="pitch-pop">
        <line x1={flagX} y1={24} x2={flagX} y2={42} stroke="var(--accent-deep)" strokeWidth={1.6} />
        <path
          d={team === 'p2' ? `M${flagX} 24 l9 3 l-9 3 z` : `M${flagX} 24 l-9 3 l9 3 z`}
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
        y={CENTER_Y - 5}
        width={7}
        height={10}
        rx={1.2}
        fill="var(--ink-muted)"
        transform={`rotate(8 ${centerX} ${CENTER_Y})`}
      />
      <title>Card</title>
    </g>
  );
}

export function PitchView({
  momentum,
  matchResult,
  participant1,
  participant2,
  phase,
  connectionLost = false,
}: {
  momentum: PitchMomentum;
  matchResult: MatchResultProbabilities | null;
  participant1: string;
  participant2: string;
  phase: 'pre' | 'live' | 'finished';
  connectionLost?: boolean;
}) {
  const ballX = FIELD_LEFT + momentum.ballAdvance * FIELD_WIDTH;
  const glowRadius = 30 + momentum.intensity * 34;
  const glowOpacity = 0.14 + momentum.intensity * 0.5;
  const isHot = momentum.dangerLevel === 'high_danger';
  const caption = captionFor(momentum, matchResult, participant1, participant2, phase);
  const pendingTeamName =
    momentum.pendingSignal !== null
      ? teamName(momentum.pendingSignal.team, participant1, participant2)
      : null;

  return (
    <figure
      className={`transition-opacity duration-[var(--duration-standard)] ${
        connectionLost ? 'opacity-50' : 'opacity-100'
      }`}
    >
      <svg
        viewBox="0 0 340 200"
        role="img"
        aria-label={`Pressure pitch, live from the feed. ${caption}.`}
        className="w-full"
      >
        <defs>
          <radialGradient id="pitchHeat" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.9" />
            <stop offset="65%" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Printed pitch markings, hairline on a faint accent field. */}
        <g stroke="var(--hairline)" strokeWidth={1} fill="none">
          <rect x={FIELD_LEFT} y={14} width={FIELD_WIDTH} height={172} rx={8} fill="var(--accent-soft)" />
          <line x1={CENTER_X} y1={14} x2={CENTER_X} y2={186} />
          <circle cx={CENTER_X} cy={CENTER_Y} r={26} />
          <rect x={FIELD_LEFT} y={54} width={46} height={92} />
          <rect x={FIELD_LEFT + FIELD_WIDTH - 46} y={54} width={46} height={92} />
        </g>
        <g fill="var(--ink-faint)" stroke="none">
          <circle cx={CENTER_X} cy={CENTER_Y} r={1.6} />
          <rect x={8} y={86} width={6} height={28} rx={1} />
          <rect x={326} y={86} width={6} height={28} rx={1} />
        </g>

        {/* Pre-event shimmer: the anticipation beat, before the event lands. */}
        {momentum.pendingSignal !== null ? (
          <g
            className="pitch-shimmer"
            transform={`translate(${attackingX(momentum.pendingSignal.team) - CENTER_X} 0)`}
          >
            <circle
              cx={CENTER_X}
              cy={CENTER_Y}
              r={16}
              fill="none"
              stroke="var(--accent-deep)"
              strokeWidth={1.6}
              strokeDasharray="3 4"
            />
            <title>
              {`${pendingTeamName !== null ? `${pendingTeamName} ` : ''}${momentum.pendingSignal.kind} looks on`}
            </title>
          </g>
        ) : null}

        {/* Momentum: the hot-zone halo and the ball needle, sliding as one. */}
        <g
          style={{
            transform: `translateX(${ballX - CENTER_X}px)`,
            transition: 'transform var(--duration-standard) var(--ease-standard)',
          }}
        >
          <circle
            cx={CENTER_X}
            cy={CENTER_Y}
            r={glowRadius}
            fill="url(#pitchHeat)"
            opacity={glowOpacity}
            className={isHot ? 'pitch-heat' : undefined}
          />
          <circle cx={CENTER_X} cy={CENTER_Y} r={5} fill="var(--ink)" stroke="var(--card)" strokeWidth={1.4}>
            <title>{caption}</title>
          </circle>
        </g>

        {/* Event burst, keyed by the marker id so it plays exactly once. */}
        {momentum.lastEvent !== null && phase !== 'pre' ? (
          <EventBurst
            key={momentum.lastEvent.id}
            kind={momentum.lastEvent.kind}
            team={momentum.lastEvent.team}
          />
        ) : null}
      </svg>

      <figcaption className="tabular mt-2 flex items-center justify-center gap-2 text-center font-mono text-xs text-ink-muted">
        <span>{caption}</span>
        {phase === 'live' ? (
          <>
            <span aria-hidden className="text-ink-faint">
              -
            </span>
            <span className="text-ink-faint">live, no video</span>
          </>
        ) : null}
      </figcaption>
    </figure>
  );
}
