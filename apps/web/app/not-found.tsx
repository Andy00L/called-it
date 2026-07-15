import type { Viewport } from 'next';
import Link from 'next/link';
import { EmptyState } from '../components/ui/empty-state';
import { PaperPanel } from '../components/ui/surface';
import { buttonClassName } from '../components/ui/button-styles';
import { BroadcastShell, BroadcastTopBar } from '../components/ui/broadcast-shell';
import { Eyebrow } from '../components/ui/eyebrow';

export const viewport: Viewport = {
  // sourceRef: docs/UI_DESIGN_SYSTEM.md, broadcast night field --cream.
  themeColor: '#0A130C',
};

/**
 * The designed dead end for every unknown route (a mistyped match link, a
 * stale share): the broadcast shell instead of the framework's bare 404.
 */
export default function NotFound() {
  return (
    <BroadcastShell>
      <div className="mx-auto w-full max-w-[560px]">
        <BroadcastTopBar eyebrow={<Eyebrow>Off the pitch</Eyebrow>} />
        <PaperPanel>
          <div className="p-2">
            <EmptyState
              motif="flag"
              title="This page is not on the programme"
              action={
                <Link href="/" className={buttonClassName('primary')}>
                  Back to the lobby
                </Link>
              }
            />
          </div>
        </PaperPanel>
      </div>
    </BroadcastShell>
  );
}
