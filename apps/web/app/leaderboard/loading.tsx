import { Skeleton } from '../../components/ui/skeleton';
import { Card, Tray } from '../../components/ui/surface';

/** Standings loading state: skeleton rows mirroring rank, name, points. */
export default function LeaderboardLoading() {
  return (
    <main aria-busy className="mx-auto w-full max-w-[760px] px-5 pb-20 sm:px-7.5">
      <div className="grid grid-cols-[44px_1fr_44px] items-center gap-3 pb-3.5 pt-3">
        <Skeleton className="size-11" />
        <Skeleton className="mx-auto h-2.5 w-44" />
        <span />
      </div>
      <div className="mb-6 mt-5">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="mt-2.5 h-3.5 w-72" />
      </div>
      <Tray className="p-2">
        <Card>
          {[0, 1, 2, 3, 4].map((row) => (
            <div
              key={row}
              className={`flex min-h-13 items-center gap-3 px-4 ${row === 0 ? '' : 'rule-dashed'}`}
            >
              <Skeleton className="h-2.5 w-4" />
              <Skeleton className="h-3 w-40" />
              <Skeleton className="ml-auto h-3 w-11" />
            </div>
          ))}
        </Card>
      </Tray>
    </main>
  );
}
