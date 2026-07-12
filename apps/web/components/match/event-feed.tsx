import type { MatchEvent, MatchSquadsPayload, PlayerActionEntry } from '@calledit/contracts';
import { Card } from '../ui/surface';
import { formatClockMinutes, teamTag } from '../../lib/format';
import { shortSurname } from '../../lib/squad';

// Display labels for feed actions (snake_case vocabulary, txline-api-facts).
const ACTION_LABELS: Record<string, string> = {
  goal: 'goal',
  corner: 'corner',
  yellow_card: 'yellow card',
  red_card: 'red card',
  shot: 'shot',
};

// Actions the feed attributes to a player. Corner and shot never carry a
// player id, so they are never named (honesty rule: name only what the feed
// attributes; see the pitch player card).
const ATTRIBUTED_ACTIONS = new Set(['goal', 'yellow_card', 'red_card']);

const SHOWN_EVENT_COUNT = 8;

/**
 * The attributed player's short surname for an event, matched to the feed's
 * own player actions by kind and clock, or null when the feed did not
 * attribute this event (it names goals and cards, never a corner or a shot).
 */
function playerNameForEvent(
  event: MatchEvent,
  playerActions: PlayerActionEntry[],
  squads: MatchSquadsPayload | null,
): string | null {
  if (squads === null || !ATTRIBUTED_ACTIONS.has(event.action)) {
    return null;
  }
  const candidates = playerActions.filter(
    (action) => action.kind === event.action && action.clockSeconds === event.clockSeconds,
  );
  const matched =
    candidates.find(
      (action) =>
        (action.team === 'p1' && event.participant === 1) ||
        (action.team === 'p2' && event.participant === 2),
    ) ?? candidates[0];
  if (matched === undefined) {
    return null;
  }
  for (const team of [squads.p1, squads.p2]) {
    const player = team?.players.find((candidate) => candidate.playerId === matched.playerId);
    if (player !== undefined) {
      return shortSurname(player.name);
    }
  }
  return null;
}

export function EventFeed({
  events,
  participant1,
  participant2,
  squads = null,
  playerActions = [],
}: {
  events: MatchEvent[];
  participant1: string;
  participant2: string;
  /** Both squads, for naming attributed events; null hides every name. */
  squads?: MatchSquadsPayload | null;
  /** The feed's attributed player moments, matched to events by kind + clock. */
  playerActions?: PlayerActionEntry[];
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
          {shown.map((event, index) => {
            const playerName = playerNameForEvent(event, playerActions, squads);
            return (
              <div
                key={`${event.ts}:${event.action}:${event.clockSeconds}`}
                className={`flex items-baseline gap-3 py-[11px] text-[13px] text-ink-muted ${
                  index === 0 ? '' : 'rule-dashed'
                }`}
              >
                <span className="tabular font-mono text-xs">
                  {formatClockMinutes(event.clockSeconds)}
                </span>
                <span className="flex-1">
                  {ACTION_LABELS[event.action] ?? event.action}
                  {playerName !== null ? (
                    <>
                      {' '}
                      <span aria-hidden className="text-ink-faint">
                        &middot;
                      </span>{' '}
                      <span className="text-ink">{playerName}</span>
                    </>
                  ) : null}
                </span>
                <span className="font-mono text-xs">
                  {event.participant === 1
                    ? teamTag(participant1)
                    : event.participant === 2
                      ? teamTag(participant2)
                      : ''}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
