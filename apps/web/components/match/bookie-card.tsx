import { Eyebrow } from '../ui/eyebrow';
import { formatProbability } from '../../lib/format';

/**
 * The Bookie's bronze plate (broadcast match export): the ghost opponent
 * speaks in one line under a quiet bowler-hat watermark. The bronze panel
 * appears in the bottom row only.
 */
export function BookieCard({
  lastMirroredProbability,
}: {
  /** Probability of the Bookie's latest mirror, null before any lock. */
  lastMirroredProbability: number | null;
}) {
  return (
    <section
      aria-label="The Bookie"
      className="bc-bronze relative overflow-hidden px-5 py-4.5"
    >
      <svg
        aria-hidden
        width="150"
        height="150"
        viewBox="0 0 24 24"
        fill="rgba(217,188,106,0.07)"
        className="absolute -top-3.5 right-[-20px]"
      >
        <path d="M7 9 c0 -3 2 -5 5 -5 s5 2 5 5 l.6 1.8 c2.4 .3 4.4 1 4.4 1.9 0 1.3 -4.5 2.3 -10 2.3 S2 14 2 12.7 c0 -.9 2 -1.6 4.4 -1.9 Z" />
      </svg>
      <Eyebrow>The Bookie</Eyebrow>
      <p className="relative mt-3 text-sm leading-relaxed text-ink-muted">
        {lastMirroredProbability === null ? (
          <>
            The Bookie always takes the market favorite.{' '}
            <span className="font-semibold italic text-accent-deep">Beat it.</span>
          </>
        ) : (
          <>
            Mirrored your call at the market favorite{' '}
            <span className="tabular font-mono font-semibold text-ink">
              {formatProbability(lastMirroredProbability)}
            </span>
          </>
        )}
      </p>
    </section>
  );
}
