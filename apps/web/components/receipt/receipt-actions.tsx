'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '../ui/button';
import { buttonClassName } from '../ui/button-styles';

// Copied confirmation dwell (sheet motion: small move, quick reset).
const COPIED_RESET_MS = 1200;

/**
 * The share row under the public receipt (screen 03): start calling, copy
 * the link, open the memo transaction.
 */
export function ReceiptActions({ explorerUrl }: { explorerUrl: string | null }) {
  const [isCopied, setIsCopied] = useState(false);

  useEffect(() => {
    if (!isCopied) {
      return;
    }
    const timer = setTimeout(() => setIsCopied(false), COPIED_RESET_MS);
    return () => clearTimeout(timer);
  }, [isCopied]);

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setIsCopied(true);
    } catch {
      // Clipboard denied (permissions): the address bar still has the URL.
    }
  };

  return (
    <div className="mt-8 flex flex-wrap justify-center gap-2.5">
      <Link href="/" className={buttonClassName('primary')}>
        Start calling
      </Link>
      <Button
        variant="ghost"
        className="min-w-28"
        onClick={() => {
          void handleCopy();
        }}
      >
        {isCopied ? (
          <span className="inline-flex items-center gap-1.5 [animation:chip-in_var(--duration-small)_var(--ease-enter)_both]">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
              <path
                d="M2 6.5L4.8 9.2 10 3.5"
                stroke="var(--accent-deep)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Copied
          </span>
        ) : (
          'Copy link'
        )}
      </Button>
      {explorerUrl !== null ? (
        <a href={explorerUrl} target="_blank" rel="noreferrer" className={buttonClassName('ghost')}>
          View on explorer
        </a>
      ) : null}
    </div>
  );
}
