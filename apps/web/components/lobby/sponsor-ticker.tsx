import Link from 'next/link';
import type { SponsorBoardEntry } from '@calledit/contracts';

/**
 * The LED sponsor board (self-serve ad surface, docs/TECH_DOC.md): a
 * pitchside-style ink band where paid names ride a continuous loop. The
 * screen-time tier is literal: a weight-2 sponsor rides the loop twice.
 * The trailing call-to-action sells the empty space, so the band never
 * pretends to be sold out. The dark plate appears once on the lobby.
 */

interface TickerItem {
  text: string;
  isCta: boolean;
}

// Scroll pace: seconds per item ride, clamped so short boards stay calm and
// long boards stay readable (linear marquee, sheet motion rules).
const SECONDS_PER_ITEM = 5;
const MIN_LOOP_SECONDS = 18;
const MAX_LOOP_SECONDS = 70;

function buildLoopItems(sponsors: SponsorBoardEntry[]): TickerItem[] {
  const items: TickerItem[] = [];
  for (const sponsor of sponsors) {
    const text =
      sponsor.tagline === null || sponsor.tagline === ''
        ? sponsor.name
        : `${sponsor.name}: ${sponsor.tagline}`;
    for (let ride = 0; ride < sponsor.weight; ride += 1) {
      items.push({ text, isCta: false });
    }
  }
  if (items.length === 0) {
    items.push({ text: 'This board is for sale', isCta: false });
  }
  items.push({ text: 'Your name here, paid in SOL', isCta: true });
  return items;
}

function TickerRun({ items, hidden }: { items: TickerItem[]; hidden: boolean }) {
  return (
    <div aria-hidden={hidden || undefined} className="flex items-center gap-8 pr-8">
      {items.map((item, index) =>
        item.isCta ? (
          <Link
            key={index}
            href="/sponsor"
            tabIndex={hidden ? -1 : undefined}
            className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-accent hover:underline"
          >
            {item.text}
            <span aria-hidden>&#9656;</span>
          </Link>
        ) : (
          <span
            key={index}
            className="inline-flex items-center gap-8 font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-white/80"
          >
            {item.text}
            <span aria-hidden className="size-1 rounded-full bg-accent" />
          </span>
        ),
      )}
    </div>
  );
}

export function SponsorTicker({
  sponsors,
  sellEmptySpace = false,
}: {
  sponsors: SponsorBoardEntry[];
  /** Only the /sponsor page previews an unsold board; everywhere else the
   *  band renders solely when someone has paid (product rule). */
  sellEmptySpace?: boolean;
}) {
  if (sponsors.length === 0 && !sellEmptySpace) {
    return null;
  }
  const items = buildLoopItems(sponsors);
  const loopSeconds = Math.min(
    MAX_LOOP_SECONDS,
    Math.max(MIN_LOOP_SECONDS, items.length * SECONDS_PER_ITEM),
  );
  return (
    <section
      aria-label="Sponsor board"
      className="overflow-hidden rounded-card bg-ink py-2.5 [box-shadow:var(--shadow-btn-secondary)]"
    >
      <div
        className="flex w-max [animation:ticker-scroll_linear_infinite]"
        style={{ animationDuration: `${loopSeconds}s` }}
      >
        {/* The track renders twice so the -50% loop point shows no jump;
            the second run is decoration only. */}
        <TickerRun items={items} hidden={false} />
        <TickerRun items={items} hidden />
      </div>
    </section>
  );
}
