import { Skeleton } from '../components/ui/skeleton';
import { Eyebrow } from '../components/ui/eyebrow';
import { StadiumBowlSkeleton } from '../components/lobby/stadium-bowl';

/** One shelf edition skeleton on the floodlit stage. */
function RailCardSkeleton() {
  return (
    <div className="bc-card flex min-h-[164px] w-[250px] flex-none flex-col p-4">
      <Skeleton tone="deep" className="h-4 w-24" />
      <Skeleton tone="deep" className="mt-auto h-3.5 w-36" />
      <Skeleton tone="deep" className="mt-2 h-2.5 w-24" />
    </div>
  );
}

/** Lobby loading state: skeletons mirroring the bowl and the programme shelf. */
export default function LobbyLoading() {
  return (
    <div className="broadcast broadcast-field min-h-dvh overflow-x-clip">
      <main aria-busy className="mx-auto w-full max-w-[1240px] px-5 pb-16 pt-6 sm:px-8">
        <div className="gilt-plate flex items-center justify-between gap-4 rounded-[12px] px-6 py-3.5">
          <span className="whitespace-nowrap text-[17px] font-bold tracking-[0.15em] text-ink [text-shadow:0_1px_0_rgba(0,0,0,0.6)]">
            CALLED IT
          </span>
          <div className="flex gap-2.5">
            <Skeleton className="h-10 w-27" />
            <Skeleton className="h-10 w-20" />
          </div>
        </div>

        <section className="relative mx-auto mb-12 mt-8">
          <StadiumBowlSkeleton />
          <div className="relative z-[4] mx-auto flex max-w-[860px] flex-col items-center gap-5 px-5 pt-[104px] sm:pt-[140px] lg:pt-[158px]">
            <Skeleton className="h-2.5 w-44" />
            <Skeleton className="h-12 w-full max-w-[560px]" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
        </section>

        <div className="mt-10">
          <div className="mx-0.5 mb-3 flex items-baseline justify-between gap-3">
            <Eyebrow>The programme</Eyebrow>
            <Skeleton className="h-4 w-20" />
          </div>
          <div className="gilt-frame">
            <div className="bc-pitch relative overflow-hidden">
              <div className="mx-auto flex w-max items-end gap-5 px-7 pb-10 pt-16 max-sm:pt-10">
                <RailCardSkeleton />
                <RailCardSkeleton />
                <RailCardSkeleton />
                <RailCardSkeleton />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
