import type { Viewport } from 'next';
import { fetchSponsorBoard } from '../../lib/sponsor-api';
import { SponsorForm } from '../../components/sponsor/sponsor-form';
import { SponsorTicker } from '../../components/lobby/sponsor-ticker';
import { Card, PaperPanel, Tray } from '../../components/ui/surface';
import { Eyebrow } from '../../components/ui/eyebrow';
import { BroadcastShell, BroadcastTopBar } from '../../components/ui/broadcast-shell';

export const viewport: Viewport = {
  // sourceRef: docs/UI_DESIGN_SYSTEM.md, broadcast night field --cream.
  themeColor: '#0A130C',
};

/**
 * The self-serve sponsorship page: what the board is, the transparent
 * price, the form, and who is riding right now. Payment is one wallet
 * transfer verified on-chain by the worker before anything renders.
 */
export default async function SponsorPage() {
  const board = await fetchSponsorBoard();

  return (
    <BroadcastShell>
      <div className="mx-auto w-full max-w-[680px]">
        <BroadcastTopBar eyebrow={<Eyebrow>Sponsor the board</Eyebrow>} />

        <header className="mb-8 mt-8 text-center">
          <h1 className="bc-title text-[clamp(30px,4vw,40px)] font-bold leading-[1.1] tracking-[-0.02em] text-white">
            Your name on the lobby.
            <br />
            <span className="text-accent">Paid in SOL, live in seconds.</span>
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-ink-muted">
            The ticker every fan scrolls past is a real ad slot. Pick a duration and a
            screen-time tier, pay from your wallet, and the board updates the moment the chain
            confirms. The price is a public formula; no sales call.
          </p>
        </header>

        <PaperPanel>
          <div className="p-3">
            <SponsorForm />
          </div>
        </PaperPanel>

        <div className="mt-8">
          <SponsorTicker sponsors={board} sellEmptySpace />
        </div>

        {board.length > 0 ? (
          <div className="mt-5">
            <PaperPanel>
              <Tray className="p-2">
                <div className="mx-2.5 mb-2 mt-1.5 flex">
                  <Eyebrow>Riding now</Eyebrow>
                </div>
                <Card className="overflow-hidden">
                  {board.map((sponsor, index) => (
                    <div
                      key={`${sponsor.name}-${sponsor.endsAtMs}`}
                      className={`flex items-baseline justify-between gap-3 px-4 py-3 ${
                        index === 0 ? '' : 'rule-dashed'
                      }`}
                    >
                      <span className="truncate text-sm font-medium text-ink">
                        {sponsor.name}
                      </span>
                      <span className="tabular flex-none font-mono text-xs text-ink-muted">
                        {sponsor.weight}x until{' '}
                        {new Intl.DateTimeFormat(undefined, {
                          month: 'short',
                          day: 'numeric',
                        }).format(new Date(sponsor.endsAtMs))}
                      </span>
                    </div>
                  ))}
                </Card>
              </Tray>
            </PaperPanel>
          </div>
        ) : null}

        <p className="mt-8 text-center text-xs text-ink-muted">
          Names render as plain text on the public board. The game reserves the right to refund
          and remove anything unfit for a stadium.
        </p>
      </div>
    </BroadcastShell>
  );
}
