import Link from 'next/link';
import { fetchLeaderboard } from '../../lib/api';
import { EmptyState } from '../../components/ui/empty-state';
import { Surface } from '../../components/ui/surface';
import { formatPoints } from '../../lib/format';

export default async function LeaderboardPage() {
  const result = await fetchLeaderboard();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:px-6">
      <nav>
        <Link
          href="/"
          className="text-sm text-ink-muted transition-colors duration-[var(--duration-small)] hover:text-ink"
        >
          &larr; All matches
        </Link>
      </nav>
      <header className="flex flex-col gap-1">
        <h1 className="font-mono text-2xl font-semibold tracking-tight">Leaderboard</h1>
        <p className="text-sm text-ink-muted">
          Points only come from beating the market. Streaks multiply the brave.
        </p>
      </header>

      {!result.ok ? (
        <EmptyState
          title="The feed is unreachable"
          detail="The live worker did not answer. It usually recovers on its own; try reloading in a few seconds."
        />
      ) : result.entries.length === 0 ? (
        <EmptyState
          title="Nobody on the board yet"
          detail="Lock a call during a live match and your handle shows up here."
        />
      ) : (
        <Surface className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-[0.08em] text-ink-muted">
                <th scope="col" className="px-4 py-3 font-medium">#</th>
                <th scope="col" className="px-4 py-3 font-medium">Player</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Points</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Streak</th>
              </tr>
            </thead>
            <tbody>
              {result.entries.map((entry, index) => (
                <tr key={entry.playerId} className="border-b border-line last:border-b-0">
                  <td
                    className={`tabular px-4 py-3 font-mono ${index < 3 ? 'font-semibold text-accent' : 'text-ink-muted'}`}
                  >
                    {index + 1}
                  </td>
                  <td className="max-w-40 truncate px-4 py-3">{entry.handle}</td>
                  <td className="tabular px-4 py-3 text-right font-mono font-semibold">
                    {formatPoints(entry.totalPoints)}
                  </td>
                  <td className="tabular px-4 py-3 text-right font-mono text-ink-muted">
                    {entry.currentStreak > 0 ? `x${entry.currentStreak}` : '0'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Surface>
      )}
    </main>
  );
}
