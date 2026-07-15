'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { WALLET_FAILURE_COPY } from '../../lib/wallet';
import { useSolanaWallets, type SolanaWalletEntry } from '../../lib/solana-wallets';
import { Button } from './button';

/**
 * Shared wallet picker (moved out of the profile claim so the sponsor
 * payment reuses it): a button opening the list of wallets the browser
 * announces, in the programme's chip language. One pick runs the caller's
 * async flow; the caller renders failures through errorMessage.
 *
 * The menu renders in a body portal with fixed placement: every caller sits
 * inside the programme paper, whose inner layer clips its children
 * (ui/surface.tsx, PaperPanel), so a menu anchored in normal flow is cut off
 * at the panel edge. Anchoring to the viewport keeps it whole wherever the
 * button lands, and it flips above the button when the space below is short.
 */

/** Menu box width in px; matches the w-60 class on the menu. */
const MENU_WIDTH_PX = 240;
/** Gap between the button and the menu, in px. */
const MENU_GAP_PX = 6;
/** Menu height ceiling in px; matches the max-h-[264px] class on the menu. */
const MENU_MAX_HEIGHT_PX = 264;
/** Smallest gap kept between the menu and a viewport edge, in px. */
const VIEWPORT_MARGIN_PX = 8;

type MenuPlacement =
  | { kind: 'below'; leftPx: number; topPx: number }
  | { kind: 'above'; leftPx: number; bottomPx: number };

function placeMenuAgainstViewport(anchor: HTMLElement): MenuPlacement {
  const anchorRect = anchor.getBoundingClientRect();
  const rightmostLeftPx = window.innerWidth - MENU_WIDTH_PX - VIEWPORT_MARGIN_PX;
  const leftPx = Math.max(VIEWPORT_MARGIN_PX, Math.min(anchorRect.left, rightmostLeftPx));
  const spaceBelowPx = window.innerHeight - anchorRect.bottom;
  const spaceAbovePx = anchorRect.top;
  if (spaceBelowPx < MENU_MAX_HEIGHT_PX + MENU_GAP_PX && spaceAbovePx > spaceBelowPx) {
    return { kind: 'above', leftPx, bottomPx: window.innerHeight - anchorRect.top + MENU_GAP_PX };
  }
  return { kind: 'below', leftPx, topPx: anchorRect.bottom + MENU_GAP_PX };
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
  const [placement, setPlacement] = useState<MenuPlacement | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const isOpen = placement !== null;

  const openMenu = (): void => {
    if (anchorRef.current !== null) {
      setPlacement(placeMenuAgainstViewport(anchorRef.current));
    }
  };

  // Dismiss the picker on an outside click or Escape, and keep the menu on its
  // button while the page moves under it. External systems: document pointer
  // and key events, window scroll and resize; all cleaned up on close.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const isInsidePicker = (target: EventTarget | null): boolean =>
      target instanceof Node &&
      ((anchorRef.current !== null && anchorRef.current.contains(target)) ||
        (menuRef.current !== null && menuRef.current.contains(target)));
    const handlePointerDown = (event: MouseEvent): void => {
      if (!isInsidePicker(event.target)) {
        setPlacement(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setPlacement(null);
      }
    };
    const handleViewportChange = (): void => {
      if (anchorRef.current !== null) {
        setPlacement(placeMenuAgainstViewport(anchorRef.current));
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleViewportChange, true);
    window.addEventListener('resize', handleViewportChange);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleViewportChange, true);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, [isOpen]);

  const pickWallet = (wallet: SolanaWalletEntry): void => {
    setPlacement(null);
    onPick(wallet);
  };

  return (
    <div ref={anchorRef} className="inline-flex flex-col">
      <Button
        variant={variant}
        isLoading={isWorking}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        onClick={() => (isOpen ? setPlacement(null) : openMenu())}
      >
        {isWorking ? workingLabel : label}
      </Button>

      {placement !== null
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label="Choose a wallet"
              style={
                placement.kind === 'below'
                  ? { left: `${placement.leftPx}px`, top: `${placement.topPx}px` }
                  : { left: `${placement.leftPx}px`, bottom: `${placement.bottomPx}px` }
              }
              className="fixed z-30 max-h-[264px] w-60 overflow-y-auto rounded-card border border-hairline bg-card p-1.5 [box-shadow:var(--shadow-float)] [animation:chip-in_var(--duration-small)_var(--ease-enter)_both]"
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
                      <img
                        src={wallet.icon}
                        alt=""
                        aria-hidden
                        className="size-5 flex-none rounded"
                      />
                    ) : (
                      <span className="flex-none">
                        <WalletGlyph />
                      </span>
                    )}
                    <span className="truncate">{wallet.name}</span>
                  </button>
                ))
              )}
            </div>,
            document.body,
          )
        : null}

      {errorMessage !== null ? (
        <p role="alert" className="mt-2 text-xs text-miss">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
