import type { WheelTeam } from '../../lib/teams';
import { FlagRoundel } from '../ui/flag-roundel';

/**
 * The stadium bowl (broadcast lobby skin): a wireframe ellipse of stadium
 * light behind the hero title, with every World Cup team the feed has served
 * riding the rim on a slow orbit. Alive teams carry their next-match win
 * probability (there is no tournament-winner market in the feed, so none is
 * shown); eliminated teams gray out as OUT. Purely decorative: the real
 * navigable tournament state is the programme shelf below.
 */

// Bowl geometry from the accepted broadcast export: a 1020x440 ellipse; the
// orbit path is the same ellipse the rings draw.
const BOWL_WIDTH = 1020;
const BOWL_HEIGHT = 440;
const BOWL_ORBIT_PATH = 'M 510 0 A 510 220 0 1 1 510 440 A 510 220 0 1 1 510 0 Z';
// One full ride of the rim; matches the bowl-orbit keyframes in globals.css.
const ORBIT_SECONDS = 90;

function BowlBadge({ team, offsetPct }: { team: WheelTeam; offsetPct: number }) {
  const isAlive = team.status === 'alive';
  const label = !isAlive
    ? `${team.code} OUT`
    : team.nextMatchWinPct === null
      ? team.code
      : `${team.code} ${team.nextMatchWinPct}%`;
  // Reduced motion holds these inline seats: badges parked on the bottom
  // arc stay dimmed there so the static ring never covers the hero copy.
  const isOnBottomArc = offsetPct > 25 && offsetPct < 75;
  return (
    <div
      className="bowl-orbit-run absolute left-0 top-0 z-[3] flex flex-col items-center gap-1.5"
      style={{
        offsetPath: `path('${BOWL_ORBIT_PATH}')`,
        offsetRotate: '0deg',
        offsetDistance: `${offsetPct.toFixed(2)}%`,
        opacity: isOnBottomArc ? 0.12 : 1,
        // A negative delay seats the badge at its rim position mid-orbit.
        animationDelay: `-${((offsetPct / 100) * ORBIT_SECONDS).toFixed(2)}s`,
      }}
    >
      <span
        className={
          isAlive
            ? 'rounded-full [box-shadow:0_0_20px_rgba(109,177,255,0.35),0_8px_16px_rgba(0,0,0,0.55)]'
            : 'rounded-full opacity-40 grayscale [box-shadow:0_6px_14px_rgba(0,0,0,0.55)]'
        }
      >
        <FlagRoundel teamName={team.name} size={isAlive ? 46 : 40} />
      </span>
      <span
        className={`tabular whitespace-nowrap rounded-full border px-2.5 py-0.5 font-mono text-[10px] tracking-[0.12em] ${
          isAlive
            ? 'border-[var(--accent-line)] bg-[rgba(6,10,7,0.75)] text-accent'
            : 'border-[rgba(160,175,160,0.3)] bg-[rgba(6,10,7,0.75)] text-ink-faint'
        }`}
      >
        {label}
      </span>
    </div>
  );
}

/**
 * The bowl as the hero backdrop: fills its relative parent, sits behind the
 * hero text. Purely decorative (aria-hidden); it never intercepts a click.
 * The fixed-size rig scales down at the smaller breakpoints.
 */
export function StadiumBowl({ teams }: { teams: WheelTeam[] }) {
  if (teams.length === 0) {
    return null;
  }
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden [animation:deck-in_var(--duration-standard)_var(--ease-enter)_both]"
    >
      <div
        className="absolute left-1/2 top-[34px] origin-top -translate-x-1/2 scale-[0.42] min-[480px]:scale-[0.58] sm:scale-75 lg:scale-100"
        style={{ width: BOWL_WIDTH, height: BOWL_HEIGHT }}
      >
        <div className="bowl-ring-outer absolute inset-0" />
        <div className="bowl-ring-dashed absolute inset-[26px_64px]" />
        <div className="bowl-ring-inner absolute inset-[44px_104px]" />
        <div className="bowl-glow-arc absolute -inset-0.5" />
        <div className="bowl-grid absolute inset-[8px_22px]" />
        <div className="bowl-ring-gilt absolute inset-[64px_140px]" />
        <div className="bowl-center-glow absolute left-1/2 top-[52%] h-[280px] w-[640px] -translate-x-1/2 -translate-y-1/2" />
        <div className="bowl-circuit-left absolute -left-[120px] top-[58%] h-[1.5px] w-[240px]" />
        <div className="bowl-circuit-right absolute -right-[140px] top-[34%] h-[1.5px] w-[260px]" />
        {teams.map((team, teamIndex) => (
          <BowlBadge
            key={team.name}
            team={team}
            offsetPct={(teamIndex / teams.length) * 100}
          />
        ))}
      </div>
    </div>
  );
}

/** Loading shape: the faint bowl rings behind the hero skeleton. */
export function StadiumBowlSkeleton() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute left-1/2 top-[34px] origin-top -translate-x-1/2 scale-[0.42] min-[480px]:scale-[0.58] sm:scale-75 lg:scale-100"
        style={{ width: BOWL_WIDTH, height: BOWL_HEIGHT }}
      >
        <div className="bowl-ring-dashed absolute inset-0" />
        <div className="bowl-ring-inner absolute inset-[44px_104px]" />
      </div>
    </div>
  );
}
