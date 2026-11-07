import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Receipt } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatDateTime, formatMoney, TRANSACTION_STATUS_LABEL } from '@/lib/format';
import type { Transaction, TransactionStatus } from '@/types/database';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { EmptyState, LoadingRows } from '@/components/ui/EmptyState';
import { TransactionStatusBadge } from '@/components/ui/StatusBadge';

type Filter = 'all' | TransactionStatus;

const FILTERS: Filter[] = ['all', 'completed', 'pending', 'declined', 'failed', 'created', 'capturing', 'cancelled'];

export function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    let active = true;
    supabase
      .from('transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data, error: queryError }) => {
        if (!active) return;
        if (queryError) setError('We could not load your transactions. Please refresh the page.');
        else setTransactions((data ?? []) as Transaction[]);
      });
    return () => {
      active = false;
    };
  }, []);

  const visible = useMemo(
    () => (transactions ?? []).filter((txn) => filter === 'all' || txn.status === filter),
    [transactions, filter]
  );

  return (
    <>
      <PageHeader
        title="Transactions"
        description="Every PayPal payment attempt, verified on the server. Only completed captures count as revenue."
      />

      {error && <Alert tone="error">{error}</Alert>}

      <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Filter transactions">
        {FILTERS.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={filter === item}
            onClick={() => setFilter(item)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
              filter === item ? 'bg-navy-800 text-white shadow-sm' : 'bg-white text-navy-600 ring-1 ring-navy-200 hover:bg-navy-50'
            }`}
          >
            {item === 'all' ? 'All' : TRANSACTION_STATUS_LABEL[item]}
          </button>
        ))}
      </div>

      <Card padded={false}>
        {!transactions && !error && <LoadingRows rows={5} />}
        {transactions && transactions.length === 0 && (
          <EmptyState
            icon={Receipt}
            title="No transactions yet"
            description="Payments appear here as soon as a customer starts paying an open invoice through PayPal."
            action={<Link to="/invoices" className="text-sm font-medium text-emerald-700 hover:text-emerald-600">Go to invoices</Link>}
          />
        )}
        {transactions && transactions.length > 0 && visible.length === 0 && (
          <EmptyState icon={Receipt} title="Nothing with this status" description="Choose another filter to see more payments." />
        )}
        {visible.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-navy-100 text-sm">
              <thead className="bg-navy-50/60 text-left text-xs font-semibold uppercase tracking-wide text-navy-500">
                <tr>
                  <th scope="col" className="px-6 py-3">Date</th>
                  <th scope="col" className="px-6 py-3">Payer</th>
                  <th scope="col" className="px-6 py-3">PayPal order</th>
                  <th scope="col" className="px-6 py-3">Status</th>
                  <th scope="col" className="px-6 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100 bg-white">
                {visible.map((txn) => (
                  <tr key={txn.id} className="transition-colors hover:bg-navy-50/50">
                    <td className="whitespace-nowrap px-6 py-4 text-navy-600">{formatDateTime(txn.created_at)}</td>
                    <td className="px-6 py-4">
                      <p className="font-medium text-navy-900">{txn.payer_name ?? 'Pending'}</p>
                      <p className="text-xs text-navy-400">{txn.payer_email ?? ''}</p>
                      {txn.failure_reason && <p className="mt-1 max-w-xs text-xs text-red-600">{txn.failure_reason}</p>}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-navy-600">{txn.paypal_order_id}</td>
                    <td className="px-6 py-4"><TransactionStatusBadge status={txn.status} /></td>
                    <td className="px-6 py-4 text-right font-semibold tabular-nums text-navy-900">{formatMoney(txn.amount_cents, txn.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
