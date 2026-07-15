import Link from 'next/link';

/**
 * The broadcast night shell and nav, shared by every page on the skin
 * (sheet, "Broadcast night" section). The top padding lives on main (not a
 * child margin) so nothing collapses through the shell and exposes the
 * cream body above the night field.
 */

export const BROADCAST_NAV_LINK_CLASSES =
  'gilt-btn inline-flex min-h-10 items-center justify-center rounded-card px-4.5 text-sm font-semibold text-ink no-underline transition-transform duration-[var(--duration-micro)] ease-[var(--ease-standard)] hover:text-white active:scale-[0.97]';

export function BroadcastShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="broadcast broadcast-field min-h-dvh overflow-x-clip">
      <main className="mx-auto w-full max-w-[1240px] px-5 pb-16 pt-6 sm:px-8">{children}</main>
    </div>
  );
}

/** Back-to-lobby header for inner pages: gilt Back, centered eyebrow. */
export function BroadcastTopBar({
  eyebrow,
  right,
}: {
  eyebrow: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 pb-4 pt-3">
      <span className="justify-self-start">
        <Link
          href="/"
          aria-label="Back to the lobby"
          className={BROADCAST_NAV_LINK_CLASSES}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden className="mr-2">
            <path
              d="M10 3L5 8l5 5"
              stroke="var(--accent)"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Back
        </Link>
      </span>
      <span className="justify-self-center">{eyebrow}</span>
      <span className="justify-self-end">{right}</span>
    </div>
  );
}

export function BroadcastNav() {
  return (
    <nav
      aria-label="Main"
      className="gilt-plate flex items-center justify-between gap-4 rounded-[12px] px-6 py-3.5"
    >
      <Link
        href="/"
        className="whitespace-nowrap text-[17px] font-bold tracking-[0.15em] text-ink no-underline [text-shadow:0_1px_0_rgba(0,0,0,0.6)]"
      >
        CALLED IT
      </Link>
      <div className="flex gap-2.5">
        <Link href="/leaderboard" className={BROADCAST_NAV_LINK_CLASSES}>
          Leaderboard
        </Link>
        <Link href="/profile" className={BROADCAST_NAV_LINK_CLASSES}>
          Profile
        </Link>
      </div>
    </nav>
  );
}
