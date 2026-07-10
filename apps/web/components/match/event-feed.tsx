import type { MatchEvent } from '@calledit/contracts';
import { Card } from '../ui/surface';
import { formatClockMinutes, teamTag } from '../../lib/format';

// Display labels for feed actions (snake_case vocabulary, txline-api-facts).
const ACTION_LABELS: Record<string, string> = {
  goal: 'goal',
  corner: 'corner',
  yellow_card: 'yellow card',
  red_card: 'red card',
  shot: 'shot',
};

const SHOWN_EVENT_COUNT = 8;

export function EventFeed({
  events,
  participant1,
  participant2,
}: {
  events: MatchEvent[];
  participant1: string;
  participant2: string;
}) {
  const shown = events.slice(-SHOWN_EVENT_COUNT).reverse();
  return (
    <Card className="px-4 py-0.5">
      {shown.length === 0 ? (
        <p className="py-3 text-[13px] text-ink-muted">
          No confirmed events yet. Calls settle on confirmed events only.
        </p>
      ) : (
        <div aria-live="polite">
          {shown.map((event, index) => (
            <div
              key={`${event.ts}:${event.action}:${event.clockSeconds}`}
              className={`flex items-baseline gap-3 py-[11px] text-[13px] text-ink-muted ${
                index === 0 ? '' : 'rule-dashed'
              }`}
            >
              <span className="tabular font-mono text-xs">
                {formatClockMinutes(event.clockSeconds)}
              </span>
              <span className="flex-1">{ACTION_LABELS[event.action] ?? event.action}</span>
              <span className="font-mono text-xs">
                {event.participant === 1
                  ? teamTag(participant1)
                  : event.participant === 2
                    ? teamTag(participant2)
                    : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
