import type { Currency, Invoice, Transaction } from '@/types/database';

export interface MonthBucket {
  key: string;
  label: string;
  paidCents: number;
  invoicedCents: number;
  paidCount: number;
}

type InvoiceSlice = Pick<Invoice, 'status' | 'total_cents' | 'currency' | 'created_at' | 'paid_at'>;

export function primaryCurrency(invoices: { currency: Currency }[]): Currency {
  const counts = new Map<Currency, number>();
  invoices.forEach((invoice) => counts.set(invoice.currency, (counts.get(invoice.currency) ?? 0) + 1));
  let best: Currency = 'USD';
  let bestCount = 0;
  counts.forEach((count, currency) => {
    if (count > bestCount) {
      best = currency;
      bestCount = count;
    }
  });
  return best;
}

export function buildMonthlyBuckets(invoices: InvoiceSlice[], currency: Currency, months: number, now: Date): MonthBucket[] {
  const buckets: MonthBucket[] = [];
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    buckets.push({
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      label: date.toLocaleDateString('en-US', { month: 'short' }),
      paidCents: 0,
      invoicedCents: 0,
      paidCount: 0,
    });
  }
  const index = new Map(buckets.map((bucket, position) => [bucket.key, position]));

  invoices
    .filter((invoice) => invoice.currency === currency)
    .forEach((invoice) => {
      const createdKey = invoice.created_at.slice(0, 7);
      const createdAt = index.get(createdKey);
      if (createdAt !== undefined) buckets[createdAt].invoicedCents += invoice.total_cents;

      if (invoice.status === 'paid' && invoice.paid_at) {
        const paidAt = index.get(invoice.paid_at.slice(0, 7));
        if (paidAt !== undefined) {
          buckets[paidAt].paidCents += invoice.total_cents;
          buckets[paidAt].paidCount += 1;
        }
      }
    });

  return buckets;
}

export function completedRevenueCents(transactions: Pick<Transaction, 'status' | 'amount_cents' | 'currency'>[], currency: string): number {
  return transactions
    .filter((txn) => txn.status === 'completed' && txn.currency === currency)
    .reduce((total, txn) => total + txn.amount_cents, 0);
}
