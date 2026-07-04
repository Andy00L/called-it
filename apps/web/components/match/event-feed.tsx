import type { MatchEvent } from '@calledit/contracts';
import { formatClockMinutes } from '../../lib/format';

// Display labels for feed actions (snake_case vocabulary, txline-api-facts).
const ACTION_LABELS: Record<string, string> = {
  goal: 'Goal',
  corner: 'Corner',
  yellow_card: 'Yellow card',
  red_card: 'Red card',
};

const SHOWN_EVENT_COUNT = 12;

export function EventFeed({ events }: { events: MatchEvent[] }) {
  const shown = events.slice(-SHOWN_EVENT_COUNT).reverse();
  if (shown.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        No goals, corners, or cards yet. Calls resolve on confirmed events only.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2" aria-live="polite">
      {shown.map((event) => (
        <li
          key={`${event.ts}:${event.action}:${event.clockSeconds}`}
          className="flex items-center gap-3 text-sm"
        >
          <span className="tabular w-10 shrink-0 font-mono text-ink-muted">
            {formatClockMinutes(event.clockSeconds)}
          </span>
          <span className={event.action === 'goal' ? 'font-semibold text-accent' : ''}>
            {ACTION_LABELS[event.action] ?? event.action}
          </span>
          <span className="text-ink-faint">
            {event.participant === 1 ? 'home side' : event.participant === 2 ? 'away side' : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}
