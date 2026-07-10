import Link from 'next/link';
import { EmptyState } from '../../../components/ui/empty-state';
import { Tray } from '../../../components/ui/surface';
import { buttonClassName } from '../../../components/ui/button-styles';

/** Unknown pick id (screen 03, state 04): a designed dead end. */
export default function ReceiptNotFound() {
  return (
    <main className="mx-auto w-full max-w-[640px] px-5 pb-20 sm:px-7.5">
      <div className="flex py-3">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center border border-hairline px-3.5 text-[15px] font-semibold tracking-[-0.03em] text-ink hover:underline"
        >
          CALLED IT
        </Link>
      </div>
      <div className="mx-auto mt-14 max-w-[300px]">
        <Tray className="p-2">
          <EmptyState
            motif="flag"
            title="No receipt at this address"
            action={
              <Link href="/" className={buttonClassName('primary')}>
                See live matches
              </Link>
            }
          />
        </Tray>
      </div>
    </main>
  );
}
