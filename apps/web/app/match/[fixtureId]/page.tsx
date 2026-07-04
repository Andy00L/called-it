import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fetchFixtures } from '../../../lib/api';
import { LiveMatch } from '../../../components/match/live-match';

export default async function MatchPage({
  params,
}: {
  params: Promise<{ fixtureId: string }>;
}) {
  const { fixtureId: rawFixtureId } = await params;
  const fixtureId = Number.parseInt(rawFixtureId, 10);
  if (!Number.isInteger(fixtureId) || fixtureId <= 0) {
    notFound();
  }

  // Names come from the lobby listing; the live channel carries ids only.
  const listing = await fetchFixtures();
  const fixture = listing.ok
    ? listing.fixtures.find((candidate) => candidate.fixtureId === fixtureId)
    : undefined;

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
      <LiveMatch
        fixtureId={fixtureId}
        participant1={fixture?.participant1 ?? 'Home side'}
        participant2={fixture?.participant2 ?? 'Away side'}
      />
    </main>
  );
}
