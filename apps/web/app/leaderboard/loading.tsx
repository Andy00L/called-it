import { Skeleton } from '../../components/ui/skeleton';
import { Card, PaperPanel, Tray } from '../../components/ui/surface';
import { BroadcastShell } from '../../components/ui/broadcast-shell';

/** Standings loading state: skeleton rows mirroring rank, name, points. */
export default function LeaderboardLoading() {
  return (
    <BroadcastShell>
      <div aria-busy className="mx-auto w-full max-w-[800px]">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 pb-4 pt-3">
          <Skeleton className="h-10 w-24 justify-self-start" />
          <Skeleton className="h-2.5 w-44 justify-self-center" />
          <span />
        </div>
        <div className="mb-6 mt-4">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="mt-2.5 h-3.5 w-72" />
        </div>
        <PaperPanel>
          <div className="p-2">
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
          </div>
        </PaperPanel>
      </div>
    </BroadcastShell>
  );
}
