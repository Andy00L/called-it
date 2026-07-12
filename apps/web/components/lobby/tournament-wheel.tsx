import type { WheelTeam } from '../../lib/teams';
import { FlagRoundel } from '../ui/flag-roundel';

/**
 * The tournament wheel: every World Cup team the feed has served riding a
 * slowly spinning wheel, cropped to its top arc, rendered as the ambient
 * BACKDROP behind the lobby hero title. Alive teams carry their next-match
 * win probability (there is no tournament-winner market in the feed, so none
 * is shown); eliminated teams gray out as OUT. Purely decorative: the real
 * navigable tournament state is the programme rail below.
 */

// Wheel geometry: chip orbit and the two dashed echo rings, all centered far
// below the section so only the top arc shows behind the hero.
const CHIP_ORBIT_RADIUS = 422;
const INNER_RING_RADIUS = 372;
const OUTER_RING_RADIUS = 448;
const WHEEL_CENTER_TOP = 470;

// The visible top arc holds about a quarter of the circle: with fewer than
// this many chips the wheel reads empty, so the team sequence repeats around
// the rim (decor, the same real teams; the counter states the truth).
const MIN_WHEEL_SLOTS = 14;

function WheelArc({ teams }: { teams: WheelTeam[] }) {
  const repeatCount = Math.max(1, Math.ceil(MIN_WHEEL_SLOTS / teams.length));
  const slots = Array.from({ length: teams.length * repeatCount }, (_, slotIndex) => ({
    team: teams[slotIndex % teams.length] as WheelTeam,
    slotIndex,
  }));
  const stepDeg = 360 / slots.length;
  return (
    <div className="absolute left-1/2 h-0 w-0" style={{ top: WHEEL_CENTER_TOP }}>
      <div className="[animation:wheel-settle_var(--duration-standard)_var(--ease-enter)_both]">
        <div className="[animation:wheel-spin_120s_linear_infinite]">
          <div
            className="absolute box-border rounded-full border-[1.5px] border-dashed border-[rgba(18,23,15,0.14)]"
            style={{
              left: -INNER_RING_RADIUS,
              top: -INNER_RING_RADIUS,
              width: INNER_RING_RADIUS * 2,
              height: INNER_RING_RADIUS * 2,
            }}
          />
          <div
            className="absolute box-border rounded-full border border-dashed border-hairline"
            style={{
              left: -OUTER_RING_RADIUS,
              top: -OUTER_RING_RADIUS,
              width: OUTER_RING_RADIUS * 2,
              height: OUTER_RING_RADIUS * 2,
            }}
          />
          {slots.map(({ team, slotIndex }) => (
            <div
              key={`${team.name}-${slotIndex}`}
              className="absolute left-0 top-0"
              style={{ transform: `rotate(${(slotIndex * stepDeg).toFixed(1)}deg)` }}
            >
              <div
                className={`absolute flex w-[52px] flex-col items-center gap-1.5 ${
                  team.status === 'out' ? 'opacity-35 grayscale' : ''
                }`}
                style={{ left: -26, top: -CHIP_ORBIT_RADIUS }}
              >
                <FlagRoundel teamName={team.name} size={36} />
                <span
                  className={`tabular whitespace-nowrap font-mono text-[11px] ${
                    team.status === 'alive' ? 'text-accent-deep' : 'text-ink-faint'
                  }`}
                >
                  {team.status === 'out'
                    ? `${team.code} OUT`
                    : team.nextMatchWinPct === null
                      ? team.code
                      : `${team.code} ${team.nextMatchWinPct}%`}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * The wheel as the hero backdrop: fills its relative parent, sits behind the
 * hero text, and fades to the cream page so the title stays legible. Purely
 * decorative (aria-hidden); it never intercepts a click on the hero.
 */
export function TournamentWheelBackdrop({ teams }: { teams: WheelTeam[] }) {
  if (teams.length === 0) {
    return null;
  }
  const aliveCount = teams.filter((team) => team.status === 'alive').length;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden [animation:deck-in_var(--duration-standard)_var(--ease-enter)_both]"
    >
      <WheelArc teams={teams} />
      <span className="tabular absolute right-2 top-1 whitespace-nowrap font-mono text-[11px] text-ink-faint">
        {teams.length} teams &middot; {aliveCount} alive
      </span>
      {/* Fade the arc into the cream page so the title reads on solid field. */}
      <div className="absolute inset-x-0 bottom-0 h-[72%] bg-[linear-gradient(to_bottom,rgba(250,247,239,0),var(--cream)_66%)]" />
    </div>
  );
}

/** Loading shape: the faint dashed arc behind the hero skeleton. */
export function TournamentWheelBackdropSkeleton() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute left-1/2 h-[840px] w-[840px] -translate-x-1/2 rounded-full border-[1.5px] border-dashed border-[rgba(18,23,15,0.14)]"
        style={{ top: 50 }}
      />
      <div className="absolute inset-x-0 bottom-0 h-[72%] bg-[linear-gradient(to_bottom,rgba(250,247,239,0),var(--cream)_66%)]" />
    </div>
  );
}
