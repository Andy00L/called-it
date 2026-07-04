'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ProfilePayload } from '@calledit/contracts';
import { readStoredSession } from '../../lib/player';
import { getProfile } from '../../lib/game-api';
import { EmptyState } from '../../components/ui/empty-state';
import { Skeleton } from '../../components/ui/skeleton';
import { Surface } from '../../components/ui/surface';
import { Button } from '../../components/ui/button';
import { formatPoints, formatProbability } from '../../lib/format';

type ProfileView =
  | { kind: 'loading' }
  | { kind: 'no_identity' }
  | { kind: 'error' }
  | { kind: 'ready'; profile: ProfilePayload };

function SectionHeading({ children }: { children: string }) {
  return <h2 className="text-xs uppercase tracking-[0.08em] text-ink-muted">{children}</h2>;
}

function StatRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-3">
      <div className="flex flex-col">
        <span className="text-sm">{label}</span>
        {hint !== undefined ? <span className="text-xs text-ink-faint">{hint}</span> : null}
      </div>
      <span className="tabular shrink-0 font-mono text-base font-semibold">{value}</span>
    </div>
  );
}

/** Signed percentage-point display for edge: 0.083 -> "+8.3 pts". */
function formatEdge(edgeFraction: number): string {
  const points = edgeFraction * 100;
  return `${points >= 0 ? '+' : ''}${points.toFixed(1)} pts`;
}

export default function ProfilePage() {
  const [view, setView] = useState<ProfileView>({ kind: 'loading' });
  const [reloadCount, setReloadCount] = useState(0);

  // useEffect is justified: the profile lives behind a localStorage-gated
  // identity (client-only), fetched from the worker HTTP API (an external
  // system); the abort cleanup cancels the request on unmount.
  useEffect(() => {
    const abortController = new AbortController();
    const load = async (): Promise<void> => {
      const session = readStoredSession();
      if (session === null) {
        setView({ kind: 'no_identity' });
        return;
      }
      const fetched = await getProfile(session.playerId);
      if (abortController.signal.aborted) {
        return;
      }
      if (!fetched.ok) {
        setView(fetched.reason === 'unknown_player' ? { kind: 'no_identity' } : { kind: 'error' });
        return;
      }
      setView({ kind: 'ready', profile: fetched.profile });
    };
    void load();
    return () => abortController.abort();
  }, [reloadCount]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <nav>
        <Link
          href="/"
          className="text-sm text-ink-muted transition-colors duration-[var(--duration-small)] hover:text-ink"
        >
          &larr; All matches
        </Link>
      </nav>

      {view.kind === 'loading' ? (
        <div className="flex flex-col gap-4" aria-busy>
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : view.kind === 'no_identity' ? (
        <EmptyState
          title="No profile yet"
          detail="Lock your first call during a live match and your skill profile starts building here."
        />
      ) : view.kind === 'error' ? (
        <EmptyState
          title="Could not load your profile"
          detail="The game server did not answer. Retry in a moment."
          action={
            <Button variant="ghost" onClick={() => setReloadCount((count) => count + 1)}>
              Retry
            </Button>
          }
        />
      ) : (
        <ProfileBody profile={view.profile} />
      )}
    </main>
  );
}

function ProfileBody({ profile }: { profile: ProfilePayload }) {
  const margin = profile.bookie.marginPoints;
  const filledBuckets = profile.calibration.filter((bucket) => bucket.pickCount > 0);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-mono text-2xl font-semibold tracking-tight">{profile.handle}</h1>
        <p className="tabular font-mono text-4xl font-semibold">
          {formatPoints(profile.totalPoints)}
          <span className="ml-2 text-base font-normal text-ink-muted">pts</span>
        </p>
        <p className="text-sm text-ink-muted">
          streak {profile.currentStreak} (best {profile.bestStreak}) over{' '}
          {profile.settledPickCount} settled calls
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <SectionHeading>You vs The Bookie</SectionHeading>
        <Surface className="flex flex-col divide-y divide-line">
          <StatRow
            label="Your points"
            value={formatPoints(profile.bookie.playerPoints)}
            hint="on settled calls, streaks included"
          />
          <StatRow
            label="The Bookie's points"
            value={formatPoints(profile.bookie.bookiePoints)}
            hint="the market favorite of your every call, played flat"
          />
          <div className="flex items-baseline justify-between gap-3 px-4 py-3">
            <span className="text-sm font-semibold">Margin</span>
            <span
              className={`tabular shrink-0 font-mono text-xl font-semibold ${margin >= 0 ? 'text-accent' : 'text-miss'}`}
            >
              {margin >= 0 ? '+' : ''}
              {formatPoints(margin)}
            </span>
          </div>
        </Surface>
        <p className="text-xs text-ink-faint">
          Positive margin means you beat the market itself, not just other players.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <SectionHeading>Skill vs the market</SectionHeading>
        <Surface className="flex flex-col divide-y divide-line">
          <StatRow
            label="Edge vs market"
            value={profile.edgeVsMarket === null ? 'no data' : formatEdge(profile.edgeVsMarket)}
            hint="your hit rate minus what the market predicted for your picks"
          />
          <StatRow
            label="Market surprise (Brier)"
            value={
              profile.marketBrierScore === null ? 'no data' : profile.marketBrierScore.toFixed(3)
            }
            hint="higher means you hunt calls the market prices poorly"
          />
        </Surface>
      </section>

      {filledBuckets.length > 0 ? (
        <section className="flex flex-col gap-3">
          <SectionHeading>Calibration</SectionHeading>
          <Surface className="overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-[0.08em] text-ink-muted">
                  <th scope="col" className="px-4 py-3 font-medium">Market band</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Calls</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Market said</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">You hit</th>
                </tr>
              </thead>
              <tbody>
                {filledBuckets.map((bucket) => {
                  const beatMarket =
                    bucket.hitRateFraction !== null &&
                    bucket.averageProbabilityFraction !== null &&
                    bucket.hitRateFraction > bucket.averageProbabilityFraction;
                  return (
                    <tr
                      key={bucket.lowerBoundFraction}
                      className="border-b border-line last:border-b-0"
                    >
                      <td className="tabular px-4 py-3 font-mono text-ink-muted">
                        {Math.round(bucket.lowerBoundFraction * 100)}-
                        {Math.round(bucket.upperBoundFraction * 100)}%
                      </td>
                      <td className="tabular px-4 py-3 text-right font-mono">{bucket.pickCount}</td>
                      <td className="tabular px-4 py-3 text-right font-mono text-ink-muted">
                        {bucket.averageProbabilityFraction === null
                          ? ''
                          : formatProbability(bucket.averageProbabilityFraction)}
                      </td>
                      <td
                        className={`tabular px-4 py-3 text-right font-mono ${beatMarket ? 'font-semibold text-accent' : ''}`}
                      >
                        {bucket.hitRateFraction === null
                          ? ''
                          : formatProbability(bucket.hitRateFraction)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Surface>
          <p className="text-xs text-ink-faint">
            Hitting above what the market said, in any band, is edge the market missed.
          </p>
        </section>
      ) : null}
    </div>
  );
}
