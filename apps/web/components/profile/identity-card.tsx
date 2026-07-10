'use client';

import { useState } from 'react';
import type { GuestSession } from '@calledit/contracts';
import { renameHandle, RENAME_FAILURE_COPY, type RenameFailure } from '../../lib/game-api';
import { updateStoredHandle } from '../../lib/player';
import { Button } from '../ui/button';
import { Card, Tray } from '../ui/surface';
import { formatPoints } from '../../lib/format';

// sourceRef: apps/worker/src/game.ts HANDLE_PATTERN (2 to 24 chars).
const HANDLE_HINT = '2 to 24 characters';

type EditPhase =
  | { kind: 'viewing' }
  | { kind: 'editing'; draft: string; failure: RenameFailure | null }
  | { kind: 'saving'; draft: string };

/**
 * The identity card (screen 04): handle, settled count, and the rename
 * flow with its editing, saving, and distinct error states.
 */
export function IdentityCard({
  session,
  handle,
  settledPickCount,
  onRenamed,
}: {
  session: GuestSession;
  handle: string;
  settledPickCount: number;
  onRenamed: (handle: string) => void;
}) {
  const [phase, setPhase] = useState<EditPhase>({ kind: 'viewing' });

  const handleSave = async (): Promise<void> => {
    if (phase.kind !== 'editing') {
      return;
    }
    const draft = phase.draft.trim();
    if (draft.length < 2 || draft.length > 24) {
      setPhase({ kind: 'editing', draft: phase.draft, failure: 'invalid_handle' });
      return;
    }
    setPhase({ kind: 'saving', draft });
    const renamed = await renameHandle(session, draft);
    if (!renamed.ok) {
      setPhase({ kind: 'editing', draft, failure: renamed.reason });
      return;
    }
    updateStoredHandle(renamed.handle);
    onRenamed(renamed.handle);
    setPhase({ kind: 'viewing' });
  };

  const isSaving = phase.kind === 'saving';
  const failure = phase.kind === 'editing' ? phase.failure : null;

  return (
    <Tray className="p-2">
      <Card className="px-5 py-4.5">
        {phase.kind === 'viewing' ? (
          <div className="flex items-center justify-between gap-3">
            <h1 className="truncate text-[22px] font-medium tracking-[-0.03em]">{handle}</h1>
            <button
              aria-label="Rename handle"
              onClick={() => setPhase({ kind: 'editing', draft: handle, failure: null })}
              className="inline-flex size-11 flex-none items-center justify-center border border-hairline transition-transform duration-[var(--duration-micro)] ease-[var(--ease-standard)] active:scale-[0.97]"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M3 13l.8-3.2 7-7a1.2 1.2 0 0 1 1.7 0l.7.7a1.2 1.2 0 0 1 0 1.7l-7 7L3 13z"
                  stroke="var(--ink)"
                  strokeWidth="1.4"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        ) : (
          <div className="[animation:edit-in_var(--duration-small)_var(--ease-enter)_both]">
            <label htmlFor="handle-input" className="mb-1.5 block text-xs font-medium text-ink-muted">
              Handle
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="handle-input"
                value={phase.draft}
                disabled={isSaving}
                aria-invalid={failure !== null}
                onChange={(event) => {
                  setPhase({ kind: 'editing', draft: event.target.value, failure: null });
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    void handleSave();
                  }
                }}
                className={`h-11 min-w-0 flex-[1_1_160px] rounded-chip border bg-card px-3 text-base text-ink disabled:text-ink-muted ${
                  failure !== null ? 'border-miss' : 'border-hairline'
                }`}
              />
              <Button
                variant="ghost"
                disabled={isSaving}
                onClick={() => setPhase({ kind: 'viewing' })}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                isLoading={isSaving}
                onClick={() => {
                  void handleSave();
                }}
              >
                Save
              </Button>
            </div>
            <p className={`mt-2 text-xs ${failure !== null ? 'text-miss' : 'text-ink-muted'}`}>
              {failure !== null ? RENAME_FAILURE_COPY[failure] : HANDLE_HINT}
            </p>
          </div>
        )}
        <p className="mt-1.5 text-sm text-ink-muted">
          <span className="tabular font-mono">{formatPoints(settledPickCount)}</span> calls settled
        </p>
      </Card>
    </Tray>
  );
}
