import type { CalibrationBucket, ProfilePayload } from '@calledit/contracts';
import { Card, Tray } from '../ui/surface';
import { Eyebrow } from '../ui/eyebrow';

/**
 * Your reads vs the market (screen 04): per-band double bars, market
 * implied over your hit rate, then the edge and Brier line. Bars draw in
 * with the stagger constant (40ms).
 */

function bandLabel(bucket: CalibrationBucket): string {
  return `${Math.round(bucket.lowerBoundFraction * 100)}-${Math.round(bucket.upperBoundFraction * 100)}%`;
}

function BandBar({ widthPct, colorClass, delayMs }: { widthPct: number; colorClass: string; delayMs: number }) {
  return (
    <div className="h-1.5 rounded-[3px] [background:var(--band-track)]">
      <div
        className={`h-1.5 origin-left rounded-[3px] [animation:bar-in_var(--duration-standard)_var(--ease-standard)_both] ${colorClass}`}
        style={{ width: `${widthPct}%`, animationDelay: `${delayMs}ms` }}
      />
    </div>
  );
}

/** Signed percentage-point display for edge: 0.042 -> "+4.2%". */
function formatEdgePct(edgeFraction: number): string {
  const points = edgeFraction * 100;
  return `${points >= 0 ? '+' : ''}${points.toFixed(1)}%`;
}

export function CalibrationCard({ profile }: { profile: ProfilePayload }) {
  return (
    <Tray className="p-2">
      <div className="mx-2.5 mb-2 mt-1.5 flex">
        <Eyebrow>Your reads vs the market</Eyebrow>
      </div>
      <Card className="px-5 py-4">
        <div className="flex flex-wrap gap-4">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
            <span aria-hidden className="h-1.5 w-2.5 rounded-[3px] bg-pulse-low" />
            market implied
          </span>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
            <span aria-hidden className="h-1.5 w-2.5 rounded-[3px] bg-accent" />
            your hit rate
          </span>
        </div>

        {profile.calibration.map((bucket, index) => {
          const marketPct =
            bucket.averageProbabilityFraction === null
              ? 0
              : bucket.averageProbabilityFraction * 100;
          const youPct = bucket.hitRateFraction === null ? 0 : bucket.hitRateFraction * 100;
          const hasCalls = bucket.pickCount > 0;
          return (
            <div
              key={bucket.lowerBoundFraction}
              className={`grid grid-cols-[58px_1fr_92px] items-center gap-3 py-2.5 ${
                index === 0 ? 'pt-3' : 'rule-dashed'
              }`}
            >
              <span className="tabular font-mono text-xs text-ink-muted">{bandLabel(bucket)}</span>
              <div className="flex flex-col gap-1">
                <BandBar widthPct={marketPct} colorClass="bg-pulse-low" delayMs={index * 40} />
                <BandBar widthPct={youPct} colorClass="bg-accent" delayMs={index * 40} />
              </div>
              <span className="tabular text-right font-mono text-xs">
                {hasCalls ? (
                  <>
                    <span className="text-ink-muted">{Math.round(marketPct)}%</span>{' '}
                    <span className="font-semibold">{Math.round(youPct)}%</span>
                  </>
                ) : (
                  <span className="text-ink-faint">no calls</span>
                )}
              </span>
            </div>
          );
        })}

        <div className="rule-dashed mb-3 mt-1" />
        <div className="flex flex-wrap items-baseline gap-5">
          <span className="text-[13px] text-ink-muted">
            edge vs market{' '}
            <span
              className={`tabular font-mono text-sm font-semibold ${
                profile.edgeVsMarket !== null && profile.edgeVsMarket > 0
                  ? 'text-accent-deep'
                  : 'text-ink'
              }`}
            >
              {profile.edgeVsMarket === null ? 'no data' : formatEdgePct(profile.edgeVsMarket)}
            </span>
          </span>
          <span className="text-[13px] text-ink-muted">
            Brier{' '}
            <span className="tabular font-mono text-sm font-semibold text-ink">
              {profile.marketBrierScore === null ? 'no data' : profile.marketBrierScore.toFixed(3)}
            </span>
          </span>
        </div>
        <p className="mt-2.5 text-[13px] text-ink-muted">
          Positive edge means your calls beat the price the market gave them.
        </p>
      </Card>
    </Tray>
  );
}
