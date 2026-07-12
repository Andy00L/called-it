import { Eyebrow } from '../ui/eyebrow';
import { formatProbability } from '../../lib/format';

/**
 * The Bookie's ink card (screen 01): the ghost opponent speaks in one line.
 * The dark plate is the secondary-button material, used once per screen.
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
      className="rounded-card bg-ink px-4.5 py-4 text-white [box-shadow:var(--shadow-btn-secondary)]"
    >
      <span className="inline-flex items-center gap-[7px] text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
        <span aria-hidden className="text-[9px] text-accent">
          &#9656;
        </span>
        The Bookie
        <span aria-hidden className="text-[9px] text-accent">
          &#9666;
        </span>
      </span>
      <p className="mt-2 text-sm leading-normal text-white/85">
        {lastMirroredProbability === null ? (
          'The Bookie always takes the market favorite. Beat it.'
        ) : (
          <>
            Mirrored your call at the market favorite{' '}
            <span className="tabular font-mono font-semibold text-white">
              {formatProbability(lastMirroredProbability)}
            </span>
          </>
        )}
      </p>
    </section>
  );
}
