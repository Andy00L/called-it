import type { LivePayload } from '@calledit/contracts';
import { Badge } from '../ui/badge';
import { formatClockMinutes } from '../../lib/format';

export function ScoreHeader({
  payload,
  participant1,
  participant2,
}: {
  payload: LivePayload;
  participant1: string;
  participant2: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      {payload.phase === 'live' ? (
        <Badge tone="live">{formatClockMinutes(payload.clockSeconds)}</Badge>
      ) : (
        <Badge tone={payload.phase === 'finished' ? 'finished' : 'neutral'}>
          {payload.phase === 'finished' ? 'Full time' : 'Kickoff soon'}
        </Badge>
      )}
      <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3">
        <span className="truncate text-right text-lg font-semibold">{participant1}</span>
        <span className="tabular font-mono text-4xl font-semibold">
          {payload.goalsP1}
          <span className="text-ink-faint"> : </span>
          {payload.goalsP2}
        </span>
        <span className="truncate text-left text-lg font-semibold">{participant2}</span>
      </div>
    </div>
  );
}
