/**
 * Receipt loading state (screen 03, state 05): a receipt-shaped skeleton on
 * the paper itself, holes and rules already in place.
 */
function PaperSkeletonLine({ width, strong = false }: { width: string; strong?: boolean }) {
  return (
    <span
      aria-hidden
      className={`block h-2.5 rounded-[3px] [animation:skeleton-pulse_1.6s_var(--ease-standard)_infinite] ${width}`}
      style={{ background: strong ? 'rgba(21, 21, 21, 0.1)' : 'rgba(21, 21, 21, 0.07)' }}
    />
  );
}

function PaperRule() {
  return <div aria-hidden className="my-2.5 border-t border-dashed [border-color:var(--paper-rule)]" />;
}

export default function ReceiptLoading() {
  return (
    <main aria-busy className="mx-auto w-full max-w-[640px] px-5 pb-20 sm:px-7.5">
      <div className="flex py-3">
        <span className="inline-flex min-h-11 items-center border border-hairline px-3.5 text-[15px] font-semibold tracking-[-0.03em] text-ink">
          CALLED IT
        </span>
      </div>
      <div className="mx-auto mt-14 w-[300px] max-w-full rotate-[0.6deg]">
        <div className="receipt-perforation-top" aria-hidden />
        <div className="bg-paper px-4 py-3.5 [box-shadow:var(--shadow-receipt)]">
          <div className="flex justify-between">
            <PaperSkeletonLine width="w-21" strong />
            <PaperSkeletonLine width="w-13" />
          </div>
          <PaperRule />
          <div className="flex flex-col gap-2">
            <PaperSkeletonLine width="w-50" strong />
            <PaperSkeletonLine width="w-42" />
            <PaperSkeletonLine width="w-37" />
          </div>
          <PaperRule />
          <PaperSkeletonLine width="w-33" strong />
          <PaperRule />
          <div className="flex flex-col gap-2">
            <PaperSkeletonLine width="w-15" />
            <PaperSkeletonLine width="w-47" />
            <PaperSkeletonLine width="w-52" />
            <PaperSkeletonLine width="w-44" />
          </div>
          <PaperRule />
          <PaperSkeletonLine width="mx-auto w-37" />
        </div>
        <div className="receipt-perforation-bottom" aria-hidden />
      </div>
    </main>
  );
}
