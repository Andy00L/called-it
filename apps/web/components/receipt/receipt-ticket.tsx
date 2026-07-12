import type { OracleVerification, ReceiptPayload } from '@calledit/contracts';
import {
  formatClockMinutes,
  formatPoints,
  formatProbability,
  truncateHash,
} from '../../lib/format';

/**
 * The thermal receipt (signature element 2, docs/UI_DESIGN_SYSTEM.md): the
 * one shadow-casting object of the light product. Paper, mono, dashed
 * rules, perforated edges, a deterministic slight rotation. Settlement
 * moments and the public /r/{id} page only.
 */

function explorerTxUrl(txSig: string, network: 'mainnet' | 'devnet'): string {
  return `https://explorer.solana.com/tx/${txSig}${network === 'devnet' ? '?cluster=devnet' : ''}`;
}

function PaperRule() {
  return <div aria-hidden className="my-2 border-t border-dashed [border-color:var(--paper-rule)]" />;
}

function OracleLine({ oracle }: { oracle: OracleVerification | null }) {
  if (oracle === null) {
    return null;
  }
  if (oracle.status === 'verified') {
    const finals = (oracle.provenFinals ?? [])
      .map((final) => `${final.label} ${final.p1}-${final.p2}`)
      .join(', ');
    return (
      <p>
        oracle: {finals !== '' ? `${finals} ` : ''}
        <b className="text-accent-deep">VERIFIED</b>
      </p>
    );
  }
  if (oracle.status === 'pending') {
    return <p className="opacity-60">oracle: proof pending</p>;
  }
  if (oracle.status === 'mismatch') {
    return (
      <p>
        oracle: <b className="text-miss">MISMATCH</b>
      </p>
    );
  }
  // 'unavailable': market-priced calls have no on-chain stat to prove; stay
  // silent for that expected case, name the odd ones.
  return oracle.reason === 'market_priced_pick' ? null : (
    <p className="opacity-60">oracle: unavailable</p>
  );
}

export function ReceiptTicket({ receipt }: { receipt: ReceiptPayload }) {
  const { pick, settlement, commitment, proofValid, fixture, network } = receipt;
  // Deterministic tilt (SSR-stable): the pick id decides the direction.
  const rotationClass = pick.id.charCodeAt(0) % 2 === 0 ? 'rotate-[0.6deg]' : '-rotate-[0.6deg]';

  return (
    <div className={`mx-auto w-[300px] max-w-full ${rotationClass}`}>
      <div className="[animation:receipt-in_var(--duration-hero)_var(--ease-enter)_both]">
        <div className="receipt-perforation-top" aria-hidden />
        <div className="tabular bg-paper px-4 py-3.5 font-mono text-xs leading-[1.65] text-paper-ink [box-shadow:var(--shadow-receipt)]">
          <div className="flex justify-between">
            <b className="tracking-[0.14em]">CALLED IT</b>
            <span className="opacity-60">RECEIPT</span>
          </div>

          <PaperRule />

          <p>
            <b>{pick.claim}</b>
          </p>
          {fixture !== null ? (
            <p className="opacity-60">
              {fixture.participant1} vs {fixture.participant2} ({fixture.competition})
            </p>
          ) : null}
          <p>
            locked {formatClockMinutes(pick.lockClockSeconds)} at{' '}
            {formatProbability(pick.probabilityFraction)}
            {receipt.playerHandle !== null ? ` by ${receipt.playerHandle}` : ''}
          </p>

          <PaperRule />

          <div className="flex items-baseline justify-between">
            <span className="opacity-60">RESULT</span>
            {settlement === null ? (
              <b>OPEN, settles live</b>
            ) : settlement.outcome === 'hit' ? (
              <b className="text-sm">HIT +{formatPoints(settlement.pointsAwarded)} pts</b>
            ) : (
              <b>
                <span className="text-miss">MISS</span> 0 pts
              </b>
            )}
          </div>
          {settlement !== null &&
          settlement.outcome === 'miss' &&
          settlement.nearMissSeconds !== null &&
          pick.predicate.kind === 'event_window' ? (
            <p className="opacity-60">
              so close: the {pick.category} came{' '}
              {formatClockMinutes(pick.predicate.toClockSeconds + settlement.nearMissSeconds)},
              window closed {formatClockMinutes(pick.predicate.toClockSeconds)}
            </p>
          ) : null}

          <PaperRule />

          <p className="opacity-60">PROOF</p>
          {commitment === null ? (
            <p className="opacity-60">not committed yet, batches post about every minute</p>
          ) : (
            <>
              <p>root {truncateHash(commitment.rootHashHex)}</p>
              {commitment.memoTxSig !== null ? (
                <p>
                  solana{' '}
                  <a
                    href={explorerTxUrl(commitment.memoTxSig, network)}
                    className="underline decoration-[var(--paper-rule)] underline-offset-2"
                    target="_blank"
                    rel="noreferrer"
                  >
                    memo tx {truncateHash(commitment.memoTxSig)}
                  </a>
                </p>
              ) : (
                <p className="opacity-60">memo tx posting</p>
              )}
              <p>
                leaf {commitment.leafIndex + 1} of {commitment.pickCount}
              </p>
              <p>
                merkle check:{' '}
                {proofValid === true ? (
                  <>
                    root recomputed, <b>VALID</b>
                  </>
                ) : proofValid === false ? (
                  <b className="text-miss">INVALID</b>
                ) : (
                  <span className="opacity-60">pending</span>
                )}
              </p>
              <OracleLine oracle={receipt.oracleVerification} />
            </>
          )}

          <PaperRule />

          <p className="text-center tracking-[0.14em] opacity-60">
            {commitment !== null && commitment.memoTxSig !== null && proofValid === true
              ? 'ANCHORED ON SOLANA'
              : 'CALLED IT'}
          </p>
        </div>
        <div className="receipt-perforation-bottom" aria-hidden />
      </div>
    </div>
  );
}
