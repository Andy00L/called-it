'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { GuestSession, ProfilePayload } from '@calledit/contracts';
import { readStoredSession } from '../../lib/player';
import { getProfile } from '../../lib/game-api';
import { EmptyState } from '../../components/ui/empty-state';
import { Skeleton } from '../../components/ui/skeleton';
import { Card, Tray } from '../../components/ui/surface';
import { Button } from '../../components/ui/button';
import { buttonClassName } from '../../components/ui/button-styles';
import { Eyebrow } from '../../components/ui/eyebrow';
import { IdentityCard } from '../../components/profile/identity-card';
import { StatsCards } from '../../components/profile/stats-cards';
import { BookieDuel } from '../../components/profile/bookie-duel';
import { CalibrationCard } from '../../components/profile/calibration-card';

type ProfileView =
  | { kind: 'loading' }
  | { kind: 'no_identity' }
  | { kind: 'error' }
  | { kind: 'ready'; session: GuestSession; profile: ProfilePayload };

function TopBar() {
  return (
    <div className="grid grid-cols-[44px_1fr_44px] items-center gap-3 pb-3.5 pt-3">
      <Link
        href="/"
        aria-label="Back to the lobby"
        className="inline-flex size-11 items-center justify-center border border-hairline transition-transform duration-[var(--duration-micro)] ease-[var(--ease-standard)] active:scale-[0.97]"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
          <path
            d="M10 3L5 8l5 5"
            stroke="var(--ink)"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </Link>
      <span className="justify-self-center">
        <Eyebrow>Your profile</Eyebrow>
      </span>
      <span />
    </div>
  );
}

function LoadingLayout() {
  return (
    <div aria-busy className="flex flex-col gap-3.5">
      <Tray className="p-2">
        <Card className="px-5 py-4.5">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="size-11" />
          </div>
          <Skeleton className="mt-3 h-3 w-24" />
        </Card>
      </Tray>
      <Tray className="p-2">
        <div className="flex gap-2">
          {[0, 1, 2].map((plate) => (
            <Card key={plate} className="flex-1 p-3.5">
              <Skeleton className="h-2 w-16" />
              <Skeleton className="mt-2.5 h-6 w-13" />
            </Card>
          ))}
        </div>
      </Tray>
      <Tray className="p-2">
        <Card className="px-4.5 py-4">
          {[0, 1, 2, 3, 4].map((band) => (
            <div
              key={band}
              className={`grid grid-cols-[58px_1fr_60px] items-center gap-3 py-2.5 ${
                band === 0 ? '' : 'rule-dashed'
              }`}
            >
              <Skeleton className="h-2.5 w-full" />
              <Skeleton className="h-1.5 w-full rounded-[3px]" />
              <Skeleton className="h-2.5 w-full" />
            </div>
          ))}
        </Card>
      </Tray>
    </div>
  );
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
      setView({ kind: 'ready', session, profile: fetched.profile });
    };
    void load();
    return () => abortController.abort();
  }, [reloadCount]);

  return (
    <main className="mx-auto w-full max-w-[640px] px-5 pb-20 sm:px-7.5">
      <TopBar />

      {view.kind === 'loading' ? (
        <LoadingLayout />
      ) : view.kind === 'no_identity' ? (
        <Tray className="p-2">
          <EmptyState
            motif="flag"
            title="Lock your first call during a live match"
            action={
              <Link href="/" className={buttonClassName('primary')}>
                See live matches
              </Link>
            }
          />
        </Tray>
      ) : view.kind === 'error' ? (
        <Tray className="p-2">
          <EmptyState
            motif="error"
            title="Your profile did not load"
            action={
              <Button variant="primary" onClick={() => setReloadCount((count) => count + 1)}>
                Retry
              </Button>
            }
          />
        </Tray>
      ) : (
        <ProfileBody
          session={view.session}
          profile={view.profile}
          onRenamed={(handle) => {
            setView({
              kind: 'ready',
              session: { ...view.session, handle },
              profile: { ...view.profile, handle },
            });
          }}
        />
      )}
    </main>
  );
}

function ProfileBody({
  session,
  profile,
  onRenamed,
}: {
  session: GuestSession;
  profile: ProfilePayload;
  onRenamed: (handle: string) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <IdentityCard
        session={session}
        handle={profile.handle}
        settledPickCount={profile.settledPickCount}
        onRenamed={onRenamed}
      />

      {profile.settledPickCount === 0 ? (
        <Tray className="p-2">
          <EmptyState
            motif="flag"
            title="Lock your first call during a live match"
            action={
              <Link href="/" className={buttonClassName('primary')}>
                See live matches
              </Link>
            }
          />
        </Tray>
      ) : (
        <>
          <StatsCards
            totalPoints={profile.totalPoints}
            currentStreak={profile.currentStreak}
            bestStreak={profile.bestStreak}
          />
          <BookieDuel bookie={profile.bookie} />
          <CalibrationCard profile={profile} />
        </>
      )}
    </div>
  );
}
