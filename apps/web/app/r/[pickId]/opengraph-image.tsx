import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CSSProperties } from 'react';
import { ImageResponse } from 'next/og';
import type { ReceiptPayload } from '@calledit/contracts';
import { fetchReceipt, isPickIdShaped } from '../../../lib/api';
import {
  formatClockMinutes,
  formatPoints,
  formatProbability,
  truncateHash,
} from '../../../lib/format';

/**
 * Link-unfurl image for /r/{pickId}: the thermal receipt as a 1200x630 card,
 * so a pasted receipt link lands in a chat as the brand object itself.
 * A missing or unloadable pick renders the generic CALLED IT card, never a 500.
 */

export const alt = 'CALLED IT receipt';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Raw hex is deliberate: this route renders a PNG, the CSS tokens cannot
// reach it. sourceRef: apps/web/app/globals.css (docs/UI_DESIGN_SYSTEM.md).
const CREAM = '#faf7ef';
const PAPER = '#f6f3ea';
const PAPER_INK = '#151515';
const PAPER_RULE = 'rgba(21, 21, 21, 0.3)';
const MISS = '#d24141';
// --shadow-receipt scaled 2x: the web ticket is 300px wide, this card is 720.
const RECEIPT_SHADOW =
  '0 20px 48px rgba(18, 23, 15, 0.14), 0 4px 6px rgba(18, 23, 15, 0.05)';

const canvasStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: CREAM,
  fontFamily: 'JetBrains Mono',
};

const ticketStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  width: 720,
  backgroundColor: PAPER,
  color: PAPER_INK,
  padding: '44px 56px',
  transform: 'rotate(-0.6deg)',
  boxShadow: RECEIPT_SHADOW,
  fontSize: 24,
};

const ruleStyle: CSSProperties = {
  borderBottom: `2px dashed ${PAPER_RULE}`,
  margin: '22px 0',
};

const headerRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  fontSize: 26,
};

const footerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  letterSpacing: '0.14em',
  opacity: 0.6,
  fontSize: 24,
};

function TicketHeader() {
  return (
    <div style={headerRowStyle}>
      <span style={{ fontWeight: 700, letterSpacing: '0.14em' }}>CALLED IT</span>
      <span style={{ opacity: 0.6 }}>RECEIPT</span>
    </div>
  );
}

function ReceiptCard({ receipt }: { receipt: ReceiptPayload }) {
  const { pick, settlement, commitment, proofValid, fixture } = receipt;
  const isAnchored =
    commitment !== null && commitment.memoTxSig !== null && proofValid === true;
  const lockedLine = `locked ${formatClockMinutes(pick.lockClockSeconds)} at ${formatProbability(
    pick.probabilityFraction,
  )}${receipt.playerHandle !== null ? ` by ${receipt.playerHandle}` : ''}`;

  return (
    <div style={canvasStyle}>
      <div style={ticketStyle}>
        <TicketHeader />
        <div style={ruleStyle} />
        <div style={{ display: 'flex', fontWeight: 700, fontSize: 44, lineHeight: 1.25 }}>
          {pick.claim}
        </div>
        {fixture !== null ? (
          <div style={{ display: 'flex', opacity: 0.6, marginTop: 12 }}>
            {`${fixture.participant1} vs ${fixture.participant2} (${fixture.competition})`}
          </div>
        ) : null}
        <div style={{ display: 'flex', marginTop: 8 }}>{lockedLine}</div>
        <div style={ruleStyle} />
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        >
          <span style={{ opacity: 0.6 }}>RESULT</span>
          {settlement === null ? (
            <span style={{ fontWeight: 700, fontSize: 30 }}>OPEN, settles live</span>
          ) : settlement.outcome === 'hit' ? (
            <span style={{ fontWeight: 700, fontSize: 40 }}>
              {`HIT +${formatPoints(settlement.pointsAwarded)} pts`}
            </span>
          ) : (
            <span style={{ display: 'flex', gap: 14, fontWeight: 700, fontSize: 40 }}>
              <span style={{ color: MISS }}>MISS</span>
              <span>0 pts</span>
            </span>
          )}
        </div>
        {commitment !== null ? (
          <div style={{ display: 'flex', opacity: 0.6, marginTop: 18 }}>
            {`root ${truncateHash(commitment.rootHashHex)}`}
          </div>
        ) : null}
        <div style={ruleStyle} />
        <div style={footerStyle}>{isAnchored ? 'ANCHORED ON SOLANA' : 'CALLED IT'}</div>
      </div>
    </div>
  );
}

function GenericCard() {
  return (
    <div style={canvasStyle}>
      <div style={ticketStyle}>
        <TicketHeader />
        <div style={ruleStyle} />
        <div style={{ display: 'flex', fontWeight: 700, fontSize: 44, lineHeight: 1.25 }}>
          Call it, prove it.
        </div>
        <div style={{ display: 'flex', opacity: 0.6, marginTop: 12 }}>
          Free live prediction game for the 2026 World Cup
        </div>
        <div style={ruleStyle} />
        <div style={footerStyle}>CALLED IT</div>
      </div>
    </div>
  );
}

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ pickId: string }>;
}) {
  const { pickId } = await params;
  const result = isPickIdShaped(pickId) ? await fetchReceipt(pickId) : null;
  const receipt = result !== null && result.ok ? result.receipt : null;

  const [regularFontData, boldFontData] = await Promise.all([
    readFile(join(process.cwd(), 'assets/JetBrainsMono-Regular.ttf')),
    readFile(join(process.cwd(), 'assets/JetBrainsMono-Bold.ttf')),
  ]);

  return new ImageResponse(
    receipt === null ? <GenericCard /> : <ReceiptCard receipt={receipt} />,
    {
      ...size,
      fonts: [
        { name: 'JetBrains Mono', data: regularFontData, weight: 400, style: 'normal' },
        { name: 'JetBrains Mono', data: boldFontData, weight: 700, style: 'normal' },
      ],
    },
  );
}
