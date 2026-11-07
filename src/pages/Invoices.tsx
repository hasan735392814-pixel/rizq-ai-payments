import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, FilePlus2, Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatDate, formatMoney, isOverdue } from '@/lib/format';
import type { InvoiceStatus, InvoiceWithCustomer } from '@/types/database';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { EmptyState, LoadingRows } from '@/components/ui/EmptyState';
import { InvoiceStatusBadge } from '@/components/ui/StatusBadge';
import { inputClassName } from '@/components/ui/Field';

type Filter = 'all' | InvoiceStatus | 'overdue';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Drafts' },
  { value: 'open', label: 'Awaiting payment' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'paid', label: 'Paid' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function Invoices() {
  const [invoices, setInvoices] = useState<InvoiceWithCustomer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let active = true;
    supabase
      .from('invoices')
      .select('*, customers(name)')
      .order('created_at', { ascending: false })
      .then(({ data, error: queryError }) => {
        if (!active) return;
        if (queryError) setError('We could not load your invoices. Please refresh the page.');
        else setInvoices((data ?? []) as unknown as InvoiceWithCustomer[]);
      });
    return () => {
      active = false;
    };
  }, []);

  const visible = useMemo(() => {
    if (!invoices) return [];
    const needle = query.trim().toLowerCase();
    return invoices.filter((invoice) => {
      const matchesFilter =
        filter === 'all' ||
        (filter === 'overdue' ? isOverdue(invoice.due_date, invoice.status) : invoice.status === filter);
      const matchesQuery =
        needle.length === 0 ||
        invoice.invoice_number.toLowerCase().includes(needle) ||
        invoice.title.toLowerCase().includes(needle) ||
        (invoice.customers?.name ?? '').toLowerCase().includes(needle);
      return matchesFilter && matchesQuery;
    });
  }, [invoices, filter, query]);

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Create, confirm and track every invoice. Only drafts can be edited or deleted once they are confirmed."
        action={
          <Link to="/invoices/new">
            <Button variant="accent" icon={<FilePlus2 className="h-4 w-4" aria-hidden="true" />}>
              New invoice
            </Button>
          </Link>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}

      <Card padded={false}>
        <div className="flex flex-col gap-4 border-b border-navy-100 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-400" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search invoices or customers"
              aria-label="Search invoices"
              className={`${inputClassName} pl-9`}
            />
          </div>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter invoices">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                role="tab"
                aria-selected={filter === item.value}
                onClick={() => setFilter(item.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                  filter === item.value ? 'bg-navy-800 text-white shadow-sm' : 'bg-navy-50 text-navy-600 hover:bg-navy-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {!invoices && !error && <LoadingRows rows={5} />}

        {invoices && invoices.length === 0 && (
          <EmptyState
            icon={FileText}
            title="No invoices yet"
            description="Create your first invoice. Add the items, let AI write the wording, then confirm to get a PayPal payment link."
            action={
              <Link to="/invoices/new">
                <Button variant="accent">Create your first invoice</Button>
              </Link>
            }
          />
        )}

        {invoices && invoices.length > 0 && visible.length === 0 && (
          <EmptyState icon={Search} title="No matching invoices" description="Try another search or switch the filter." />
        )}

        {visible.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-navy-100 text-sm">
              <thead className="bg-navy-50/60 text-left text-xs font-semibold uppercase tracking-wide text-navy-500">
                <tr>
                  <th scope="col" className="px-6 py-3">Invoice</th>
                  <th scope="col" className="px-6 py-3">Customer</th>
                  <th scope="col" className="px-6 py-3">Due</th>
                  <th scope="col" className="px-6 py-3">Status</th>
                  <th scope="col" className="px-6 py-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-100 bg-white">
                {visible.map((invoice) => (
                  <tr key={invoice.id} className="group transition-colors hover:bg-emerald-50/40">
                    <td className="px-6 py-4">
                      <Link to={`/invoices/${invoice.id}`} className="font-medium text-navy-900 group-hover:text-emerald-700">
                        {invoice.invoice_number}
                      </Link>
                      <p className="text-xs text-navy-400">{invoice.title}</p>
                    </td>
                    <td className="px-6 py-4 text-navy-600">{invoice.customers?.name ?? '—'}</td>
                    <td className="px-6 py-4 text-navy-600">{formatDate(invoice.due_date)}</td>
                    <td className="px-6 py-4">
                      <InvoiceStatusBadge status={invoice.status} overdue={isOverdue(invoice.due_date, invoice.status)} />
                    </td>
                    <td className="px-6 py-4 text-right font-semibold tabular-nums text-navy-900">
                      {formatMoney(invoice.total_cents, invoice.currency)}
                    </td>
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
