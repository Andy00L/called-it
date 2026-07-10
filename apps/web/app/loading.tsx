import { Skeleton } from '../components/ui/skeleton';
import { Card, Tray } from '../components/ui/surface';
import { Eyebrow } from '../components/ui/eyebrow';

/** Lobby loading state: skeleton rows mirroring the three sections. */
export default function LobbyLoading() {
  return (
    <main aria-busy className="mx-auto w-full max-w-[1060px] px-5 pb-20 sm:px-7.5">
      <div className="mt-4 flex items-center justify-between gap-3 rounded-card border border-hairline bg-card px-4 py-2.5 [box-shadow:var(--shadow-float)]">
        <span className="text-[17px] font-semibold tracking-[-0.03em]">CALLED IT</span>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-27" />
          <Skeleton className="h-10 w-20" />
        </div>
      </div>

      <div className="mx-auto mb-14 mt-13 flex max-w-[760px] flex-col items-center gap-4">
        <Skeleton className="h-2.5 w-44" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-3.5 w-80" />
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <Tray className="min-w-0 flex-[2_1_560px] p-2">
          <div className="mx-2.5 mb-2 mt-1.5 flex">
            <Eyebrow>Live now</Eyebrow>
          </div>
          <Card>
            {[0, 1].map((row) => (
              <div key={row} className={`p-4 sm:px-4.5 ${row === 0 ? '' : 'rule-dashed'}`}>
                <div className="flex justify-between gap-4">
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-2 w-30" />
                    <Skeleton className="h-4 w-47" />
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Skeleton className="h-4 w-18" />
                    <Skeleton className="h-4.5 w-12" />
                  </div>
                </div>
                <Skeleton className="mt-3.5 h-0.5 w-full rounded-[2px]" />
              </div>
            ))}
          </Card>
        </Tray>

        <Tray className="min-w-0 flex-[1_1_300px] p-2">
          <div className="mx-2.5 mb-2 mt-1.5 flex">
            <Eyebrow>Up next</Eyebrow>
          </div>
          <Card>
            {[0, 1].map((row) => (
              <div
                key={row}
                className={`flex items-center justify-between gap-3.5 px-4 py-4 ${row === 0 ? '' : 'rule-dashed'}`}
              >
                <Skeleton className="h-3.5 w-37" />
                <Skeleton className="h-3 w-11" />
              </div>
            ))}
          </Card>
        </Tray>

        <Tray className="flex-[1_1_100%] p-2">
          <div className="mx-2.5 mb-2 mt-1.5 flex">
            <Eyebrow>Replay them</Eyebrow>
          </div>
          <Card>
            <div className="flex items-center justify-between gap-3.5 px-4 py-4 sm:px-4.5">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="h-4 w-16" />
            </div>
          </Card>
        </Tray>
      </div>
    </main>
  );
}
