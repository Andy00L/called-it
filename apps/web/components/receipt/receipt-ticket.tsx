import type { ReceiptPayload } from '@calledit/contracts';
import { formatClockMinutes, formatPoints, formatProbability } from '../../lib/format';

/**
 * The thermal receipt (signature element 2, docs/UI_DESIGN_SYSTEM.md): the
 * one light object in a dark product. Paper, mono, perforated edges, a
 * deterministic slight rotation. Used on settlement moments and the public
 * /r/{id} page only.
 */

function truncateHash(hashHex: string): string {
  return hashHex.length <= 16 ? hashHex : `${hashHex.slice(0, 8)}...${hashHex.slice(-8)}`;
}

function explorerTxUrl(txSig: string, network: 'mainnet' | 'devnet'): string {
  return `https://explorer.solana.com/tx/${txSig}${network === 'devnet' ? '?cluster=devnet' : ''}`;
}

function DashedRule() {
  return <div className="border-t border-dashed border-paper-ink/30" aria-hidden />;
}

export function ReceiptTicket({ receipt }: { receipt: ReceiptPayload }) {
  const { pick, settlement, commitment, proofValid, fixture, network } = receipt;
  // Deterministic tilt (SSR-stable): the pick id decides the direction.
  const rotationClass =
    pick.id.charCodeAt(0) % 2 === 0 ? 'rotate-[0.6deg]' : '-rotate-[0.6deg]';

  return (
    <div className={`mx-auto w-full max-w-sm ${rotationClass}`}>
      <div className="receipt-perforation-top" aria-hidden />
      <div className="flex flex-col gap-3 bg-paper px-5 py-4 font-mono text-sm text-paper-ink shadow-[0_16px_40px_rgba(0,0,0,0.55)]">
        <div className="flex items-baseline justify-between">
          <span className="text-base font-semibold tracking-[0.14em]">CALLED IT</span>
          <span className="text-xs uppercase tracking-[0.08em] text-paper-ink/60">receipt</span>
        </div>

        <DashedRule />

        <div className="flex flex-col gap-1">
          <p className="text-base font-semibold leading-snug">{pick.claim}</p>
          {fixture !== null ? (
            <p className="text-xs text-paper-ink/60">
              {fixture.participant1} vs {fixture.participant2} ({fixture.competition})
            </p>
          ) : null}
          <p className="tabular text-xs">
            locked {formatClockMinutes(pick.lockClockSeconds)} at{' '}
            {formatProbability(pick.probabilityFraction)}
            {receipt.playerHandle !== null ? ` by ${receipt.playerHandle}` : ''}
          </p>
        </div>

        <DashedRule />

        <div className="tabular flex items-baseline justify-between text-base">
          <span className="uppercase tracking-[0.08em] text-xs text-paper-ink/60">result</span>
          {settlement === null ? (
            <span>settling live</span>
          ) : settlement.outcome === 'hit' ? (
            <span className="font-semibold">HIT +{formatPoints(settlement.pointsAwarded)} pts</span>
          ) : (
            <span className="text-paper-ink/60">MISS</span>
          )}
        </div>

        <DashedRule />

        <div className="flex flex-col gap-1.5 text-xs">
          <span className="uppercase tracking-[0.08em] text-paper-ink/60">proof</span>
          {commitment === null ? (
            <p className="text-paper-ink/60">
              Not yet committed on-chain. Batches post about every minute; reload shortly.
            </p>
          ) : (
            <>
              <p className="tabular">
                leaf {truncateHash(commitment.leafHashHex)} (#{commitment.leafIndex} of{' '}
                {commitment.pickCount})
              </p>
              <p className="tabular">root {truncateHash(commitment.rootHashHex)}</p>
              {commitment.memoTxSig !== null ? (
                <p>
                  solana{' '}
                  <a
                    href={explorerTxUrl(commitment.memoTxSig, network)}
                    className="underline decoration-paper-ink/40 underline-offset-2"
                    target="_blank"
                    rel="noreferrer"
                  >
                    memo tx {truncateHash(commitment.memoTxSig)}
                  </a>
                </p>
              ) : null}
              <p>
                proof check:{' '}
                {proofValid === true ? (
                  <span className="font-semibold">root recomputed, VALID</span>
                ) : proofValid === false ? (
                  <span className="font-semibold">INVALID</span>
                ) : (
                  'pending'
                )}
              </p>
            </>
          )}
        </div>

        <DashedRule />

        <p className="text-center text-xs uppercase tracking-[0.14em] text-paper-ink/60">
          {commitment?.memoTxSig !== null && commitment !== null && proofValid === true
            ? 'anchored on solana'
            : 'calledit'}
        </p>
      </div>
      <div className="receipt-perforation-bottom" aria-hidden />
    </div>
  );
}
