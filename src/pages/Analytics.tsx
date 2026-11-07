import { useEffect, useMemo, useState } from 'react';
import { CircleDollarSign, Clock, FileCheck2, Hourglass } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { buildMonthlyBuckets, completedRevenueCents, primaryCurrency } from '@/lib/analytics';
import { formatMoney } from '@/lib/format';
import type { Currency, Invoice, Transaction } from '@/types/database';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { LoadingRows } from '@/components/ui/EmptyState';
import { RevenueChart } from '@/components/analytics/RevenueChart';
import { StatCard } from '@/components/dashboard/StatCard';

interface AnalyticsData {
  invoices: (Pick<Invoice, 'id' | 'status' | 'currency' | 'total_cents' | 'due_date' | 'created_at' | 'paid_at' | 'customer_id'> & { customerName: string | null })[];
  transactions: Pick<Transaction, 'status' | 'amount_cents' | 'currency' | 'created_at'>[];
}

const MONTHS = 12;

export function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      supabase
        .from('invoices')
        .select('id, status, currency, total_cents, due_date, created_at, paid_at, customer_id, customers(name)')
        .limit(1000),
      supabase.from('transactions').select('status, amount_cents, currency, created_at').limit(1000),
    ]).then(([invoiceRes, txRes]) => {
      if (!active) return;
      if (invoiceRes.error || txRes.error) {
        setError('We could not load analytics. Please refresh the page.');
        return;
      }
      const invoices = (invoiceRes.data ?? []).map((row) => {
        const { customers, ...rest } = row as typeof row & { customers: { name: string } | null };
        return { ...rest, customerName: customers?.name ?? null };
      });
      setData({ invoices: invoices as AnalyticsData['invoices'], transactions: (txRes.data ?? []) as AnalyticsData['transactions'] });
    });
    return () => {
      active = false;
    };
  }, []);

  const view = useMemo(() => {
    if (!data) return null;
    const currency: Currency = data.invoices.length > 0 ? primaryCurrency(data.invoices) : 'USD';
    const invoices = data.invoices.filter((invoice) => invoice.currency === currency);
    const outstanding = invoices.filter((invoice) => invoice.status === 'open');
    const paidInvoices = invoices.filter((invoice) => invoice.status === 'paid');
    const verifiedRevenue = completedRevenueCents(data.transactions, currency);
    const invoicedTotal = invoices.filter((invoice) => invoice.status !== 'cancelled' && invoice.status !== 'draft').reduce((sum, invoice) => sum + invoice.total_cents, 0);
    const collectionRate = invoicedTotal > 0 ? Math.round((paidInvoices.reduce((sum, invoice) => sum + invoice.total_cents, 0) / invoicedTotal) * 100) : 0;
    const byCustomer = new Map<string, number>();
    paidInvoices.forEach((invoice) => {
      const name = invoice.customerName ?? 'No customer';
      byCustomer.set(name, (byCustomer.get(name) ?? 0) + invoice.total_cents);
    });
    const topCustomers = [...byCustomer.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const overdueCount = outstanding.filter((invoice) => invoice.due_date !== null && invoice.due_date < new Date().toISOString().slice(0, 10)).length;
    return {
      currency,
      buckets: buildMonthlyBuckets(invoices, currency, MONTHS, new Date()),
      outstandingCents: outstanding.reduce((sum, invoice) => sum + invoice.total_cents, 0),
      outstandingCount: outstanding.length,
      overdueCount,
      verifiedRevenue,
      collectionRate,
      paidCount: paidInvoices.length,
      totalCount: invoices.length,
      topCustomers,
    };
  }, [data]);

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Verified revenue comes only from completed PayPal captures. Invoiced amounts are what you have billed and are labelled as such."
      />

      {error && <Alert tone="error">{error}</Alert>}
      {!view && !error && <Card padded={false}><LoadingRows rows={4} /></Card>}

      {view && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Verified revenue" value={formatMoney(view.verifiedRevenue, view.currency)} hint="Completed PayPal captures" icon={CircleDollarSign} tone="emerald" />
            <StatCard label="Outstanding" value={formatMoney(view.outstandingCents, view.currency)} hint={`${view.outstandingCount} awaiting payment`} icon={Hourglass} tone="amber" />
            <StatCard label="Overdue invoices" value={String(view.overdueCount)} hint="Open and past due date" icon={Clock} tone="amber" />
            <StatCard label="Collection rate" value={`${view.collectionRate}%`} hint={`${view.paidCount} of ${view.totalCount} invoices paid`} icon={FileCheck2} tone="emerald" />
          </div>

          <Card>
            <CardTitle title="Monthly trend" description={`Last ${MONTHS} months in ${view.currency}. Paid bars count only verified payments.`} />
            <RevenueChart buckets={view.buckets} currency={view.currency} />
          </Card>

          <Card>
            <CardTitle title="Top customers by paid invoices" description="Based on invoices marked paid." />
            {view.topCustomers.length === 0 ? (
              <p className="py-6 text-sm text-navy-500">No paid invoices yet.</p>
            ) : (
              <ul className="divide-y divide-navy-100">
                {view.topCustomers.map(([name, cents]) => (
                  <li key={name} className="flex items-center justify-between py-3 text-sm">
                    <span className="font-medium text-navy-900">{name}</span>
                    <span className="font-semibold tabular-nums text-navy-900">{formatMoney(cents, view.currency)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
