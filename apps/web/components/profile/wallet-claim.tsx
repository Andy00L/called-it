'use client';

import { useState } from 'react';
import type { GuestSession } from '@calledit/contracts';
import {
  linkWalletToProfile,
  restoreProfileFromWallet,
  shortWallet,
  WALLET_FAILURE_COPY,
  type WalletFailure,
} from '../../lib/wallet';
import type { SolanaWalletEntry } from '../../lib/solana-wallets';
import { Card, Tray } from '../ui/surface';
import { Eyebrow } from '../ui/eyebrow';
import { WalletPicker } from '../ui/wallet-picker';

/**
 * Optional wallet link (screen 04): claim the profile with a Solana wallet so
 * it can be restored on any device. Guest-first is untouched; this only adds
 * recovery. No transaction is ever signed, only an ownership challenge. The
 * shared picker (ui/wallet-picker) lists the wallets the browser announces.
 */

type Phase =
  | { kind: 'idle' }
  | { kind: 'working'; walletName: string }
  | { kind: 'error'; failure: WalletFailure };

function SolanaMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <path
        d="M3 4.2h6.2l1.8-1.7H4.8L3 4.2zM3 8.5h6.2l1.8 1.7H4.8L3 8.5zM4.8 6.3H11l-1.8-1.7H3l1.8 1.7z"
        fill="currentColor"
      />
    </svg>
  );
}

export function WalletClaim({
  session,
  walletPubkey,
  onLinked,
}: {
  session: GuestSession;
  walletPubkey: string | null;
  onLinked: (walletPubkey: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  const handleClaim = async (wallet: SolanaWalletEntry): Promise<void> => {
    setPhase({ kind: 'working', walletName: wallet.name });
    const outcome = await linkWalletToProfile(session, wallet.id);
    if (!outcome.ok) {
      setPhase({ kind: 'error', failure: outcome.reason });
      return;
    }
    onLinked(outcome.walletPubkey);
    setPhase({ kind: 'idle' });
  };

  return (
    <Tray className="p-2">
      <div className="mx-2.5 mb-2 mt-1.5 flex">
        <Eyebrow>Claim your profile</Eyebrow>
      </div>
      <Card className="px-5 py-4.5">
        {walletPubkey !== null ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium text-ink">
                <span className="text-accent-deep">
                  <SolanaMark />
                </span>
                Claimed with Solana
              </p>
              <span className="tabular mt-1.5 inline-flex items-center gap-2 rounded-chip border border-hairline bg-cream px-2.5 py-1.5 font-mono text-xs text-ink">
                <span aria-hidden className="size-1.5 rounded-full bg-accent" />
                {shortWallet(walletPubkey)}
              </span>
            </div>
            <span
              aria-hidden
              className="inline-flex size-7 flex-none items-center justify-center rounded-full bg-accent-soft"
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path
                  d="M3 6.7l2.3 2.3L10 4.2"
                  stroke="var(--accent-deep)"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </div>
        ) : (
          <>
            <p className="text-sm text-ink-muted">
              Link a Solana wallet to restore this profile on any device. No wallet is needed to
              play; this only adds recovery.
            </p>
            <div className="mt-3.5">
              <WalletPicker
                label="Claim with a wallet"
                variant="primary"
                isWorking={phase.kind === 'working'}
                workingLabel={
                  phase.kind === 'working' ? `Waiting for ${phase.walletName}...` : ''
                }
                errorMessage={phase.kind === 'error' ? WALLET_FAILURE_COPY[phase.failure] : null}
                onPick={(wallet) => {
                  void handleClaim(wallet);
                }}
              />
            </div>
          </>
        )}
      </Card>
    </Tray>
  );
}

export function WalletRestore({ onRestored }: { onRestored: (session: GuestSession) => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  const handleRestore = async (wallet: SolanaWalletEntry): Promise<void> => {
    setPhase({ kind: 'working', walletName: wallet.name });
    const outcome = await restoreProfileFromWallet(wallet.id);
    if (!outcome.ok) {
      setPhase({ kind: 'error', failure: outcome.reason });
      return;
    }
    onRestored(outcome.session);
    setPhase({ kind: 'idle' });
  };

  return (
    <div className="mt-4 flex flex-col items-center gap-2">
      <WalletPicker
        label="Restore with your wallet"
        variant="ghost"
        isWorking={phase.kind === 'working'}
        workingLabel={phase.kind === 'working' ? `Waiting for ${phase.walletName}...` : ''}
        errorMessage={phase.kind === 'error' ? WALLET_FAILURE_COPY[phase.failure] : null}
        onPick={(wallet) => {
          void handleRestore(wallet);
        }}
      />
    </div>
  );
}
