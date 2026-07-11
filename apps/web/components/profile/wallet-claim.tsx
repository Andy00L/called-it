'use client';

import { useEffect, useRef, useState } from 'react';
import type { GuestSession } from '@calledit/contracts';
import {
  linkWalletToProfile,
  restoreProfileFromWallet,
  shortWallet,
  WALLET_FAILURE_COPY,
  type WalletFailure,
} from '../../lib/wallet';
import { useSolanaWallets, type SolanaWalletEntry } from '../../lib/solana-wallets';
import { Button } from '../ui/button';
import { Card, Tray } from '../ui/surface';
import { Eyebrow } from '../ui/eyebrow';

/**
 * Optional wallet link (screen 04): claim the profile with a Solana wallet so
 * it can be restored on any device. Guest-first is untouched; this only adds
 * recovery. No transaction is ever signed, only an ownership challenge. The
 * picker lists the wallets the browser announces (Wallet Standard), so the
 * player chooses instead of getting a hard-wired provider.
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

function WalletGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect
        x="1.5"
        y="3.5"
        width="13"
        height="9.5"
        rx="1.5"
        stroke="var(--ink-muted)"
        strokeWidth="1.3"
      />
      <path d="M10.5 8.2h4" stroke="var(--ink-muted)" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="11" cy="8.2" r="0.9" fill="var(--ink-muted)" />
    </svg>
  );
}

/**
 * Shared wallet picker: a button opening the list of discovered wallets, in
 * the programme's chip language. One pick runs the async flow; distinct
 * failures render under the button.
 */
function WalletPicker({
  label,
  variant,
  phase,
  onPick,
}: {
  label: string;
  variant: 'primary' | 'ghost';
  phase: Phase;
  onPick: (wallet: SolanaWalletEntry) => void;
}) {
  const wallets = useSolanaWallets();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Dismiss the picker on an outside click or Escape.
  // External system: document pointer and key events, cleaned up on close.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handlePointerDown = (event: MouseEvent): void => {
      const target = event.target;
      if (menuRef.current !== null && target instanceof Node && !menuRef.current.contains(target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const pickWallet = (wallet: SolanaWalletEntry): void => {
    setIsOpen(false);
    onPick(wallet);
  };

  const isWorking = phase.kind === 'working';

  return (
    <div ref={menuRef} className="relative inline-flex flex-col">
      <Button
        variant={variant}
        isLoading={isWorking}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={() => setIsOpen((open) => !open)}
      >
        {isWorking ? `Waiting for ${phase.walletName}...` : label}
      </Button>

      {isOpen ? (
        <div
          role="menu"
          aria-label="Choose a wallet"
          className="absolute left-0 top-[calc(100%+6px)] z-30 w-60 rounded-card border border-hairline bg-card p-1.5 [box-shadow:var(--shadow-float)] [animation:chip-in_var(--duration-small)_var(--ease-enter)_both]"
        >
          <p className="px-2.5 pb-1.5 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
            Choose a wallet
          </p>
          {wallets.length === 0 ? (
            <p className="px-2.5 pb-2.5 text-[13px] leading-snug text-ink-muted">
              {WALLET_FAILURE_COPY.no_wallet}
            </p>
          ) : (
            wallets.map((wallet) => (
              <button
                key={wallet.id}
                type="button"
                role="menuitem"
                onClick={() => pickWallet(wallet)}
                className="flex w-full items-center gap-2.5 rounded-chip px-2.5 py-2.5 text-left text-sm font-medium text-ink transition-colors duration-[var(--duration-micro)] ease-[var(--ease-standard)] hover:bg-accent-soft active:scale-[0.97]"
              >
                {wallet.icon !== null ? (
                  // Wallet Standard icons are self-contained data URIs from the
                  // wallet's own registration; next/image adds nothing here.
                  <img src={wallet.icon} alt="" aria-hidden className="size-5 flex-none rounded" />
                ) : (
                  <span className="flex-none">
                    <WalletGlyph />
                  </span>
                )}
                <span className="truncate">{wallet.name}</span>
              </button>
            ))
          )}
        </div>
      ) : null}

      {phase.kind === 'error' ? (
        <p role="alert" className="mt-2 text-xs text-miss">
          {WALLET_FAILURE_COPY[phase.failure]}
        </p>
      ) : null}
    </div>
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
                phase={phase}
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
        phase={phase}
        onPick={(wallet) => {
          void handleRestore(wallet);
        }}
      />
    </div>
  );
}
