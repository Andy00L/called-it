'use client';

import { useEffect, useRef, useState } from 'react';
import { WALLET_FAILURE_COPY } from '../../lib/wallet';
import { useSolanaWallets, type SolanaWalletEntry } from '../../lib/solana-wallets';
import { Button } from './button';

/**
 * Shared wallet picker (moved out of the profile claim so the sponsor
 * payment reuses it): a button opening the list of wallets the browser
 * announces, in the programme's chip language. One pick runs the caller's
 * async flow; the caller renders failures through errorMessage.
 */

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

export function WalletPicker({
  label,
  variant,
  isWorking,
  workingLabel,
  errorMessage,
  onPick,
}: {
  label: string;
  variant: 'primary' | 'ghost';
  isWorking: boolean;
  /** Button label while the wallet approval is pending. */
  workingLabel: string;
  errorMessage: string | null;
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

  return (
    <div ref={menuRef} className="relative inline-flex flex-col">
      <Button
        variant={variant}
        isLoading={isWorking}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={() => setIsOpen((open) => !open)}
      >
        {isWorking ? workingLabel : label}
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

      {errorMessage !== null ? (
        <p role="alert" className="mt-2 text-xs text-miss">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
