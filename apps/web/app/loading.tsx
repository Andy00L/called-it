import { Skeleton } from '../components/ui/skeleton';
import { Eyebrow } from '../components/ui/eyebrow';
import { TournamentWheelBackdropSkeleton } from '../components/lobby/tournament-wheel';

/** One shelf card skeleton, seated on the rail's arc like the real cards. */
function RailCardSkeleton({ dropPx, tiltDeg }: { dropPx: number; tiltDeg: number }) {
  return (
    <div className="flex min-w-[240px] flex-[1_1_240px]">
      <div
        className="flex min-h-[150px] flex-1 flex-col rounded-card border border-hairline bg-card p-4"
        style={{ transform: `translateY(${dropPx}px) rotate(${tiltDeg}deg)` }}
      >
        <Skeleton className="h-3.5 w-16" />
        <Skeleton className="mt-auto h-3 w-30" />
        <Skeleton className="mt-2 h-2 w-20" />
      </div>
    </div>
  );
}

/** Lobby loading state: skeletons mirroring the wheel and the programme rail. */
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

      <section className="relative mx-auto mb-12 mt-2 max-w-[900px]">
        <TournamentWheelBackdropSkeleton />
        <div className="relative z-[1] mx-auto flex max-w-[720px] flex-col items-center gap-4 px-5 pt-[132px]">
          <Skeleton className="h-2.5 w-44" />
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-3.5 w-80" />
        </div>
      </section>

      <div className="mt-7">
        <div className="mx-0.5 mb-2.5 flex items-baseline justify-between gap-3">
          <Eyebrow>The programme</Eyebrow>
          <Skeleton className="h-3 w-16" />
        </div>
        <div className="tray px-4 pb-4 pt-6">
          <div className="flex items-stretch gap-3.5 overflow-hidden px-0.5 pb-4">
            <RailCardSkeleton dropPx={0} tiltDeg={2.5} />
            <RailCardSkeleton dropPx={12} tiltDeg={1} />
            <RailCardSkeleton dropPx={12} tiltDeg={-1} />
            <RailCardSkeleton dropPx={0} tiltDeg={-2.5} />
          </div>
        </div>
      </div>
    </main>
  );
}
