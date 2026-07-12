'use client';

import { useEffect, useState } from 'react';
import { Card } from '../ui/surface';
import { Eyebrow } from '../ui/eyebrow';

/**
 * The "How it works" strip: three programme-style steps that teach the whole
 * loop in one glance (pick, lock, win the receipt). One concept per step and
 * verb-first labels, per cognitive load research (Sweller 1988) and the Apple
 * HIG writing guidance; the full grounding lives in docs/TECH_DOC.md.
 *
 * localStorage is required by the product here: the strip is dismissible once
 * and must stay dismissed across reloads (approved scope; same rule as the
 * guest identity in lib/player.ts). The key stores a single flag.
 */
const DISMISSED_STORAGE_KEY = 'calledit.howitworks.v1';

interface HowItWorksStep {
  title: string;
  body: string;
  picto: () => React.ReactNode;
}

/** The market bar with a picking caret: choosing a priced call. */
function PickPicto() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M6.8 2.8L9 5.4l2.2-2.6"
        stroke="var(--ink)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="2" y="8" width="14" height="4.5" rx="1" stroke="var(--ink)" strokeWidth="1.5" />
      <rect x="3.4" y="9.4" width="5" height="1.7" rx="0.5" fill="var(--accent)" />
      <path
        d="M3.5 15.5h4M9.5 15.5h5"
        stroke="var(--ink-faint)"
        strokeWidth="1.2"
        strokeDasharray="2 2"
      />
    </svg>
  );
}

/** The padlock: the one deliberate tap that commits a call. */
function LockPicto() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M6 8V5.8a3 3 0 0 1 6 0V8"
        stroke="var(--ink)"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <rect x="4.2" y="8" width="9.6" height="7.2" rx="1" stroke="var(--ink)" strokeWidth="1.5" />
      <circle cx="9" cy="11.6" r="1.3" fill="var(--accent)" />
    </svg>
  );
}

/** The thermal receipt with a hit check: the win as a printed object. */
function ReceiptPicto() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path
        d="M4.5 2.5h9v11.4l-1.5 1.4-1.5-1.4-1.5 1.4-1.5-1.4-1.5 1.4z"
        stroke="var(--ink)"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M6.7 7.4l1.6 1.6 3-3.2"
        stroke="var(--accent)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M6.3 11.4h5.4" stroke="var(--ink-faint)" strokeWidth="1.2" strokeDasharray="2 2" />
    </svg>
  );
}

const STEPS: HowItWorksStep[] = [
  {
    title: 'Pick a call',
    body: 'A corner in the next 10 minutes. Rarer calls pay more points.',
    picto: PickPicto,
  },
  {
    title: 'Lock it in',
    body: 'One tap before the window closes. The Bookie mirrors you with the market favorite.',
    picto: LockPicto,
  },
  {
    title: 'Win the receipt',
    body: 'A hit prints points and a receipt, proven on Solana.',
    picto: ReceiptPicto,
  },
];

export function HowItWorks({ className = '' }: { className?: string }) {
  // null = storage not read yet (server render and first client paint stay
  // empty, so the markup never flashes for a fan who already dismissed it).
  const [isDismissed, setIsDismissed] = useState<boolean | null>(null);

  // localStorage is client-only (external system; read once after mount).
  useEffect(() => {
    setIsDismissed(window.localStorage.getItem(DISMISSED_STORAGE_KEY) !== null);
  }, []);

  const dismissForever = (): void => {
    window.localStorage.setItem(DISMISSED_STORAGE_KEY, '1');
    setIsDismissed(true);
  };

  if (isDismissed !== false) {
    return null;
  }

  return (
    <section
      aria-label="How it works"
      className={`[animation:deck-in_var(--duration-standard)_var(--ease-enter)_both] ${className}`}
    >
      <Card className="px-4 pb-4 pt-3 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <Eyebrow>How it works</Eyebrow>
          <button
            type="button"
            onClick={dismissForever}
            aria-label="Dismiss how it works"
            className="-mr-2 inline-flex size-11 items-center justify-center text-ink-muted transition-transform duration-[var(--duration-micro)] ease-[var(--ease-standard)] active:scale-[0.97]"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <path
                d="M3.5 3.5l7 7M10.5 3.5l-7 7"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <ol className="mt-2 grid gap-3.5 sm:grid-cols-3 sm:gap-0">
          {STEPS.map((step, index) => {
            const Picto = step.picto;
            return (
              <li
                key={step.title}
                className={
                  index === 0
                    ? 'sm:pr-4'
                    : 'border-dashed border-hairline max-sm:border-t max-sm:pt-3.5 sm:border-l sm:px-4 last:sm:pr-0'
                }
              >
                <div className="flex items-start gap-3">
                  <span className="flex size-9 flex-none items-center justify-center rounded-chip bg-accent-soft">
                    <Picto />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      <span className="tabular mr-1.5 font-mono text-[11px] font-normal text-ink-faint">
                        {index + 1}
                      </span>
                      {step.title}
                    </p>
                    <p className="mt-1 text-[13px] leading-normal text-ink-muted">{step.body}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </Card>
    </section>
  );
}
