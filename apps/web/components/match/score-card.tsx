import type { LivePayload } from '@calledit/contracts';
import { Badge } from '../ui/badge';
import { Card, Tray } from '../ui/surface';
import { ProbabilityPulse } from './probability-pulse';
import { formatClockMmSs, formatKickoffClock } from '../../lib/format';

/**
 * The score tray (screen 01): teams, score or kickoff time, clock + phase
 * chip, then the probability pulse under a dashed rule.
 */
export function ScoreCard({
  payload,
  participant1,
  participant2,
  startTimeMs,
  displayClockSeconds,
}: {
  payload: LivePayload;
  participant1: string;
  participant2: string;
  startTimeMs: number;
  displayClockSeconds: number;
}) {
  const isPre = payload.phase === 'pre';
  const centerValue = isPre
    ? startTimeMs > 0
      ? formatKickoffClock(startTimeMs)
      : 'soon'
    : `${payload.goalsP1} - ${payload.goalsP2}`;

  return (
    <Tray className="p-2">
      <Card className="p-5">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3.5">
          <h1 className="truncate text-right text-[22px] font-medium tracking-[-0.03em]">
            {participant1}
          </h1>
          <span className="tabular font-mono text-[28px] font-semibold">{centerValue}</span>
          <h1 className="truncate text-left text-[22px] font-medium tracking-[-0.03em]">
            {participant2}
          </h1>
        </div>

        <div className="mt-2 flex items-center justify-center gap-2.5">
          {payload.phase === 'live' ? (
            <>
              <span className="tabular font-mono text-base text-ink">
                {formatClockMmSs(displayClockSeconds)}
              </span>
              <Badge tone="live">live</Badge>
            </>
          ) : (
            <Badge tone="neutral">{isPre ? 'kick-off' : 'full time'}</Badge>
          )}
        </div>

        {payload.matchResult !== null ? (
          <>
            <div className="rule-dashed mb-3 mt-4" />
            <ProbabilityPulse
              matchResult={payload.matchResult}
              participant1={participant1}
              participant2={participant2}
            />
          </>
        ) : null}
      </Card>
    </Tray>
  );
}
