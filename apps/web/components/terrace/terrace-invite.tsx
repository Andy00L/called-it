'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { TerraceStandingsPayload } from '@calledit/contracts';
import { ensureGuestSession } from '../../lib/player';
import { joinTerrace, TERRACE_FAILURE_COPY } from '../../lib/terrace-api';
import { Button } from '../ui/button';
import { buttonClassName } from '../ui/button-styles';
import { Card, Tray } from '../ui/surface';
import { Eyebrow } from '../ui/eyebrow';

/**
 * The invite card behind a /t/:code link: name the room, seat the guest on
 * one tap (guest identity plus join), then land them on the match with the
 * terrace board open. "Just watch" goes to the same match without joining.
 */
export function TerraceInvite({
  standings,
  fixtureLine,
}: {
  standings: TerraceStandingsPayload;
  /** "France vs Spain (World Cup)" when the lobby listing knows the match. */
  fixtureLine: string | null;
}) {
  const router = useRouter();
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const matchHref = `/match/${standings.room.fixtureId}?terrace=${standings.room.code}`;

  const handleTakeSeat = async (): Promise<void> => {
    setIsWorking(true);
    setErrorMessage(null);
    const ensured = await ensureGuestSession();
    if (!ensured.ok) {
      setErrorMessage(TERRACE_FAILURE_COPY[ensured.reason]);
      setIsWorking(false);
      return;
    }
    const joined = await joinTerrace(ensured.session, standings.room.code);
    if (!joined.ok) {
      setErrorMessage(TERRACE_FAILURE_COPY[joined.reason]);
      setIsWorking(false);
      return;
    }
    router.push(matchHref);
  };

  return (
    <Tray className="p-2">
      <div className="mx-2.5 mb-2 mt-1.5 flex">
        <Eyebrow>Terrace invite</Eyebrow>
      </div>
      <Card className="px-5 py-4.5">
        <p className="text-sm text-ink-muted">You are invited to</p>
        <h1 className="mt-1 text-[22px] font-medium tracking-[-0.03em] text-ink">
          {standings.room.name}
        </h1>
        {fixtureLine !== null ? (
          <p className="mt-1.5 text-sm text-ink-muted">{fixtureLine}</p>
        ) : null}
        <p className="tabular mt-1.5 font-mono text-xs text-ink-muted">
          {`${standings.room.memberCount} seated · The Bookie plays too`}
        </p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <Button
            variant="primary"
            isLoading={isWorking}
            onClick={() => {
              void handleTakeSeat();
            }}
          >
            Take a seat
          </Button>
          <Link href={matchHref} className={buttonClassName('ghost')}>
            Just watch
          </Link>
        </div>
        {errorMessage !== null ? (
          <p role="alert" className="mt-2.5 text-xs text-miss">
            {errorMessage}
          </p>
        ) : null}
      </Card>
    </Tray>
  );
}
