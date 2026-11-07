import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleDollarSign, FilePlus2, FileCheck2, Hourglass, Sparkles, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { callFunction, ApiError } from '@/lib/functions';
import { useAuth } from '@/context/useAuth';
import { buildMonthlyBuckets, completedRevenueCents, primaryCurrency } from '@/lib/analytics';
import { formatDate, formatMoney } from '@/lib/format';
import type { Currency, InvoiceWithCustomer, Transaction } from '@/types/database';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { EmptyState, LoadingRows } from '@/components/ui/EmptyState';
import { InvoiceStatusBadge, TransactionStatusBadge } from '@/components/ui/StatusBadge';
import { StatCard } from '@/components/dashboard/StatCard';
import { RevenueChart } from '@/components/analytics/RevenueChart';

interface DashboardData {
  invoices: InvoiceWithCustomer[];
  transactions: Transaction[];
  customerCount: number;
}

const INSIGHT_QUESTION =
  'Summarize my business performance in three short bullet points, then give one concrete suggestion to improve collections.';

export function Dashboard() {
  const { business } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [insight, setInsight] = useState<string | null>(null);
  const [insightError, setInsightError] = useState<string | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const [invoicesRes, transactionsRes, customersRes] = await Promise.all([
      supabase
        .from('invoices')
        .select('*, customers(name)')
        .order('created_at', { ascending: false })
        .limit(500),
      supabase.from('transactions').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('customers').select('id', { count: 'exact', head: true }),
    ]);
    if (invoicesRes.error || transactionsRes.error || customersRes.error) {
      setError('We could not load your dashboard. Please refresh the page.');
      return;
    }
    setData({
      invoices: (invoicesRes.data ?? []) as unknown as InvoiceWithCustomer[],
      transactions: (transactionsRes.data ?? []) as Transaction[],
      customerCount: customersRes.count ?? 0,
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const generateInsight = async () => {
    setInsightLoading(true);
    setInsightError(null);
    try {
      const result = await callFunction<{ answer: string }>('/ai/business-assistant', {
        method: 'POST',
        body: { question: INSIGHT_QUESTION },
      });
      setInsight(result.answer);
    } catch (err) {
      setInsightError(err instanceof ApiError ? err.message : 'The AI insight could not be generated.');
    } finally {
      setInsightLoading(false);
    }
  };

  if (error) return <Alert tone="error" title="Dashboard unavailable">{error}</Alert>;
  if (!data) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <Card padded={false}>
          <LoadingRows rows={5} />
        </Card>
      </>
    );
  }

  const currency: Currency = data.invoices.length > 0 ? primaryCurrency(data.invoices) : ((business?.currency as Currency) ?? 'USD');
  const invoicesInCurrency = data.invoices.filter((invoice) => invoice.currency === currency);
  const revenue = completedRevenueCents(data.transactions, currency);
  const paid = invoicesInCurrency.filter((invoice) => invoice.status === 'paid');
  const open = invoicesInCurrency.filter((invoice) => invoice.status === 'open');
  const outstandingCents = open.reduce((sum, invoice) => sum + invoice.total_cents, 0);
  const buckets = buildMonthlyBuckets(invoicesInCurrency, currency, 6, new Date());
  const statusCounts = (['draft', 'open', 'paid', 'cancelled'] as const).map((status) => ({
    status,
    count: invoicesInCurrency.filter((invoice) => invoice.status === status).length,
  }));
  const totalInvoices = invoicesInCurrency.length;
  const recent = data.transactions.slice(0, 5);

  return (
    <>
      <PageHeader
        title={`Welcome back${business ? `, ${business.name}` : ''}`}
        description="Verified PayPal payments, your invoice pipeline and AI insights, all from your own records."
        action={
          <Link to="/invoices/new">
            <Button size="lg" variant="accent" icon={<FilePlus2 className="h-4 w-4" aria-hidden="true" />}>
              Create invoice
            </Button>
          </Link>
        }
      />

      {!business && (
        <Alert tone="warning" title="Finish setting up your business" >
          Add your business name and contact details in <Link className="font-semibold underline" to="/settings">Settings</Link> so customers see the right name on invoices.
        </Alert>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Verified revenue" value={formatMoney(revenue, currency)} hint="Completed PayPal captures" icon={CircleDollarSign} tone="emerald" />
        <StatCard label="Paid invoices" value={String(paid.length)} hint={`${totalInvoices} invoices in ${currency}`} icon={FileCheck2} tone="emerald" />
        <StatCard label="Awaiting payment" value={formatMoney(outstandingCents, currency)} hint={`${open.length} open invoice${open.length === 1 ? '' : 's'}`} icon={Hourglass} tone="amber" />
        <StatCard label="Customers" value={String(data.customerCount)} hint="Saved customer records" icon={Users} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardTitle title="Invoiced vs paid" description={`Last six months in ${currency}. Paid bars count only verified payments.`} />
          <RevenueChart buckets={buckets} currency={currency} />
        </Card>

        <Card>
          <CardTitle title="Invoice status" description="Share of invoices by stage." />
          {totalInvoices === 0 ? (
            <p className="py-10 text-center text-sm text-navy-400">No invoices yet.</p>
          ) : (
            <ul className="space-y-4">
              {statusCounts.map((item) => {
                const share = totalInvoices ? Math.round((item.count / totalInvoices) * 100) : 0;
                return (
                  <li key={item.status}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <InvoiceStatusBadge status={item.status} />
                      <span className="font-medium text-navy-700 tabular-nums">
                        {item.count} <span className="text-navy-400">({share}%)</span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-navy-100">
                      <div className="h-full rounded-full bg-emerald-500 transition-all duration-700 ease-out" style={{ width: `${share}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card padded={false} className="xl:col-span-2">
          <div className="p-6 pb-0">
            <CardTitle
              title="Recent transactions"
              description="Payments recorded from PayPal after server verification."
              action={
                <Link to="/transactions" className="text-sm font-medium text-emerald-700 hover:text-emerald-600">
                  View all
                </Link>
              }
            />
          </div>
          {recent.length === 0 ? (
            <EmptyState
              icon={CircleDollarSign}
              title="No payments yet"
              description="When a customer pays an invoice through PayPal, the verified payment appears here."
            />
          ) : (
            <ul className="divide-y divide-navy-100">
              {recent.map((txn) => (
                <li key={txn.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 transition-colors hover:bg-navy-50/50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-navy-900">{txn.payer_name ?? 'PayPal customer'}</p>
                    <p className="text-xs text-navy-400">{formatDate(txn.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <TransactionStatusBadge status={txn.status} />
                    <span className="text-sm font-semibold text-navy-900 tabular-nums">{formatMoney(txn.amount_cents, txn.currency)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle title="AI business insights" description="Generated from your saved invoices and payments." />
          {insightError && <Alert tone="error">{insightError}</Alert>}
          {insight ? (
            <div className="space-y-4 animate-fade-in">
              <p className="whitespace-pre-line text-sm leading-relaxed text-navy-700">{insight}</p>
              <Button variant="secondary" size="sm" onClick={generateInsight} loading={insightLoading}>
                Refresh insight
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-navy-500">
                Ask Gemini for a short review of your collections and cash flow. It only uses your records.
              </p>
              <Button variant="accent" icon={<Sparkles className="h-4 w-4" aria-hidden="true" />} onClick={generateInsight} loading={insightLoading}>
                Generate insights
              </Button>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
