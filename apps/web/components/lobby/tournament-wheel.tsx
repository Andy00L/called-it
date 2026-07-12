import type { WheelTeam } from '../../lib/teams';
import { FlagRoundel } from '../ui/flag-roundel';

/**
 * The tournament wheel (lobby hero): every World Cup team the feed has served
 * riding a slowly spinning wheel, cropped to its top arc. Alive teams carry
 * their NEXT-MATCH win probability (there is no tournament-winner market in
 * the feed, so none is ever shown); eliminated teams gray out as OUT. The
 * whole card is one link down to the programme rail.
 */

// Wheel geometry from the accepted export: chip orbit and the two dashed
// echo rings, all centered far below the card so only the top arc shows.
const CHIP_ORBIT_RADIUS = 422;
const INNER_RING_RADIUS = 372;
const OUTER_RING_RADIUS = 448;
const WHEEL_CENTER_TOP = 490;

const ALIVE_WORDS: Record<number, string> = {
  1: 'One',
  2: 'Two',
  3: 'Three',
  4: 'Four',
  5: 'Five',
  6: 'Six',
  7: 'Seven',
  8: 'Eight',
};

function headlineFor(aliveCount: number): string {
  const word = ALIVE_WORDS[aliveCount] ?? String(aliveCount);
  if (aliveCount <= 2) {
    return `${word} teams left. Call the final.`;
  }
  if (aliveCount <= 4) {
    return `${word} teams left. Call the semis.`;
  }
  return `${word} teams left. Call the next round.`;
}

// The visible top arc holds about a quarter of the circle: with fewer than
// this many chips the wheel reads empty, so the team sequence repeats around
// the rim (decor, the same real teams; the header counter states the truth).
const MIN_WHEEL_SLOTS = 14;

export function TournamentWheel({ teams }: { teams: WheelTeam[] }) {
  if (teams.length === 0) {
    return null;
  }
  const aliveCount = teams.filter((team) => team.status === 'alive').length;
  const repeatCount = Math.max(1, Math.ceil(MIN_WHEEL_SLOTS / teams.length));
  const slots = Array.from({ length: teams.length * repeatCount }, (_, slotIndex) => ({
    team: teams[slotIndex % teams.length] as WheelTeam,
    slotIndex,
  }));
  const stepDeg = 360 / slots.length;

  return (
    <section
      aria-label="The tournament"
      className="mx-auto mt-6 max-w-[640px] [animation:deck-in_var(--duration-standard)_var(--ease-enter)_both]"
    >
      <a
        href="#programme-rail"
        aria-label={`World Cup, ${aliveCount} teams left, see the programme rail`}
        className="group relative block h-[290px] overflow-hidden rounded-card border border-hairline bg-cream text-ink no-underline sm:h-[330px]"
      >
        <div
          aria-hidden
          className="absolute left-1/2 h-0 w-0"
          style={{ top: WHEEL_CENTER_TOP }}
        >
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

        <span className="tabular absolute right-4 top-3.5 whitespace-nowrap font-mono text-[11px] text-ink-muted">
          {teams.length} teams &middot; {aliveCount} alive
        </span>

        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[170px] bg-[linear-gradient(to_bottom,rgba(250,247,239,0),var(--cream)_78%)]"
        />

        <div className="absolute inset-x-5 bottom-4.5">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
            <span
              aria-hidden
              className="text-[9px] text-accent transition-transform duration-[var(--duration-small)] ease-[var(--ease-standard)] group-hover:-translate-x-0.5"
            >
              &#9656;
            </span>
            The tournament
            <span
              aria-hidden
              className="text-[9px] text-accent transition-transform duration-[var(--duration-small)] ease-[var(--ease-standard)] group-hover:translate-x-0.5"
            >
              &#9666;
            </span>
          </span>
          <h2 className="mt-2 text-[22px] font-medium leading-[1.25] tracking-[-0.03em]">
            World Cup
            <br />
            {headlineFor(aliveCount)}
          </h2>
          <p className="tabular mt-2 font-mono text-[11px] text-ink-muted">
            win % = next match, live from the market
          </p>
        </div>
      </a>
    </section>
  );
}

/** Loading shape of the wheel card: the dashed arc plus a skeleton title. */
export function TournamentWheelSkeleton() {
  return (
    <div className="relative mx-auto mt-6 h-[240px] max-w-[640px] overflow-hidden rounded-card border border-hairline bg-cream">
      <div
        aria-hidden
        className="absolute left-1/2 h-[620px] w-[620px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-dashed border-[rgba(18,23,15,0.14)]"
        style={{ top: 380 }}
      />
      <div className="absolute bottom-4.5 left-5 flex flex-col gap-2">
        <span className="h-2 w-24 rounded-chip bg-skeleton-deep [animation:skeleton-pulse_1.6s_var(--ease-standard)_infinite]" />
        <span className="h-4 w-52 rounded-chip bg-skeleton-deep [animation:skeleton-pulse_1.6s_var(--ease-standard)_infinite]" />
        <span className="h-4 w-64 rounded-chip bg-skeleton-deep [animation:skeleton-pulse_1.6s_var(--ease-standard)_infinite]" />
      </div>
    </div>
  );
}
