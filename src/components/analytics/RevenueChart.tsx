import type { MonthBucket } from '@/lib/analytics';
import { formatMoney } from '@/lib/format';

export function RevenueChart({ buckets, currency }: { buckets: MonthBucket[]; currency: string }) {
  const max = Math.max(1, ...buckets.map((bucket) => Math.max(bucket.invoicedCents, bucket.paidCents)));
  const hasData = buckets.some((bucket) => bucket.invoicedCents > 0 || bucket.paidCents > 0);

  if (!hasData) {
    return <p className="py-16 text-center text-sm text-navy-400">Create and pay invoices to see your monthly chart.</p>;
  }

  return (
    <div>
      <div className="flex h-56 items-end gap-3 sm:gap-5" role="img" aria-label="Monthly invoiced and paid amounts">
        {buckets.map((bucket) => (
          <div key={bucket.key} className="group flex h-full flex-1 flex-col justify-end gap-2">
            <div className="relative flex h-full items-end justify-center gap-1">
              <div
                className="w-1/2 max-w-[22px] rounded-t-md bg-navy-200 transition-all duration-700 ease-out group-hover:bg-navy-300"
                style={{ height: `${(bucket.invoicedCents / max) * 100}%` }}
                title={`Invoiced ${formatMoney(bucket.invoicedCents, currency)}`}
              />
              <div
                className="w-1/2 max-w-[22px] rounded-t-md bg-emerald-500 transition-all duration-700 ease-out group-hover:bg-emerald-400"
                style={{ height: `${(bucket.paidCents / max) * 100}%` }}
                title={`Paid ${formatMoney(bucket.paidCents, currency)}`}
              />
            </div>
            <p className="text-center text-xs font-medium text-navy-400">{bucket.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center justify-center gap-6 text-xs text-navy-500">
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-navy-200" aria-hidden="true" /> Invoiced
        </span>
        <span className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" aria-hidden="true" /> Paid (verified)
        </span>
      </div>
    </div>
  );
}
