'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { GuestSession } from '@calledit/contracts';
import { ensureGuestSession, readStoredSession, storeSession } from '../../lib/player';
import {
  linkWalletToProfile,
  restoreProfileFromWallet,
  shortWallet,
  WALLET_FAILURE_COPY,
} from '../../lib/wallet';
import type { SolanaWalletEntry } from '../../lib/solana-wallets';
import { Card, PaperPanel, Tray } from '../ui/surface';
import { Eyebrow } from '../ui/eyebrow';
import { WalletPicker } from '../ui/wallet-picker';
import { buttonClassName } from '../ui/button-styles';

/**
 * Register on the board before the first call (screen 05 addition): pick a
 * wallet, prove ownership with a signed challenge (never a transaction, no
 * SOL moves), and the handle is reserved under that wallet. A wallet that
 * already owns a profile is restored instead, with one more signature. The
 * card hides itself once an identity exists on this device.
 */

type Phase =
  | { kind: 'checking' }
  | { kind: 'idle' }
  | { kind: 'working'; walletName: string }
  | { kind: 'error'; message: string }
  | { kind: 'done'; session: GuestSession; walletPubkey: string | null; restored: boolean };

export function JoinBoard() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: 'checking' });

  // The stored identity is client-only; read it once after mount. An
  // existing identity keeps the card hidden ('checking' renders null).
  useEffect(() => {
    if (readStoredSession() === null) {
      setPhase({ kind: 'idle' });
    }
  }, []);

  const handleRegister = async (wallet: SolanaWalletEntry): Promise<void> => {
    setPhase({ kind: 'working', walletName: wallet.name });
    const ensured = await ensureGuestSession();
    if (!ensured.ok) {
      // ensureGuestSession fails as network/server; the wallet copy matches.
      setPhase({ kind: 'error', message: WALLET_FAILURE_COPY[ensured.reason] });
      return;
    }
    const linked = await linkWalletToProfile(ensured.session, wallet.id);
    if (linked.ok) {
      setPhase({
        kind: 'done',
        session: ensured.session,
        walletPubkey: linked.walletPubkey,
        restored: false,
      });
      return;
    }
    if (linked.reason === 'wallet_taken') {
      // The wallet already owns a profile: restore it (one more signature).
      const restored = await restoreProfileFromWallet(wallet.id);
      if (restored.ok) {
        storeSession(restored.session);
        setPhase({
          kind: 'done',
          session: restored.session,
          walletPubkey: null,
          restored: true,
        });
        // Re-render the standings so the restored row gets its "you" mark.
        router.refresh();
        return;
      }
      setPhase({ kind: 'error', message: WALLET_FAILURE_COPY[restored.reason] });
      return;
    }
    setPhase({ kind: 'error', message: WALLET_FAILURE_COPY[linked.reason] });
  };

  if (phase.kind === 'checking') {
    return null;
  }

  return (
    <section aria-label="Join the board" className="mt-5">
      <PaperPanel>
        <Tray className="p-2">
          <div className="mx-2.5 mb-2 mt-1.5 flex">
            <Eyebrow>Join the board</Eyebrow>
          </div>
          <Card className="px-5 py-4.5">
            {phase.kind === 'done' ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">
                    {phase.restored
                      ? `Profile restored: you play as ${phase.session.handle}`
                      : `You are on the board as ${phase.session.handle}`}
                  </p>
                  <p className="mt-1.5 text-[13px] text-ink-muted">
                    {phase.walletPubkey !== null ? (
                      <span className="tabular mr-2 inline-flex items-center gap-1.5 rounded-chip border border-hairline bg-cream px-2 py-1 font-mono text-xs text-ink">
                        <span aria-hidden className="size-1.5 rounded-full bg-accent" />
                        {shortWallet(phase.walletPubkey)}
                      </span>
                    ) : null}
                    Points print once your first call settles.
                  </p>
                </div>
                <Link href="/" className={buttonClassName('ghost')}>
                  See live matches
                </Link>
              </div>
            ) : (
              <>
                <p className="text-sm text-ink-muted">
                  Reserve your place before your first call: register with a Solana wallet and
                  your handle, points, and receipts are yours on any device. No transaction is
                  signed and no SOL moves; the wallet only proves the profile is yours.
                </p>
                <div className="mt-3.5">
                  <WalletPicker
                    label="Register with your wallet"
                    variant="primary"
                    isWorking={phase.kind === 'working'}
                    workingLabel={
                      phase.kind === 'working' ? `Waiting for ${phase.walletName}...` : ''
                    }
                    errorMessage={phase.kind === 'error' ? phase.message : null}
                    onPick={(wallet) => {
                      void handleRegister(wallet);
                    }}
                  />
                </div>
              </>
            )}
          </Card>
        </Tray>
      </PaperPanel>
    </section>
  );
}
