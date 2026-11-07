import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Copy, ExternalLink, FileText, Pencil, Send, XCircle, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatDateTime, formatDate, formatMoney, isOverdue } from '@/lib/format';
import { useToast } from '@/context/useToast';
import type { AuditLog, Customer, Invoice, InvoiceItem, Transaction } from '@/types/database';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, LoadingRows } from '@/components/ui/EmptyState';
import { InvoiceStatusBadge, TransactionStatusBadge } from '@/components/ui/StatusBadge';

type Action = 'open' | 'cancel' | 'delete';

function sumItemsCents(items: InvoiceItem[]): number {
  return items.reduce((total, item) => total + item.quantity * item.unit_price_cents, 0);
}

interface DetailData {
  invoice: Invoice;
  customer: Customer | null;
  items: InvoiceItem[];
  transactions: Transaction[];
  audit: AuditLog[];
}

const ACTION_COPY: Record<Action, { title: string; body: string; confirm: string; danger: boolean }> = {
  open: {
    title: 'Confirm and share this invoice?',
    body: 'After you confirm, the amounts are locked and the customer can pay with PayPal from the payment link. You can still cancel it later.',
    confirm: 'Confirm invoice',
    danger: false,
  },
  cancel: {
    title: 'Cancel this invoice?',
    body: 'The payment link will stop working. Customers will see that this invoice was cancelled.',
    confirm: 'Cancel invoice',
    danger: true,
  },
  delete: {
    title: 'Delete this draft?',
    body: 'This permanently removes the draft and its line items. Confirmed invoices cannot be deleted.',
    confirm: 'Delete draft',
    danger: true,
  },
};

export function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { notify } = useToast();
  const [data, setData] = useState<DetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [pendingAction, setPendingAction] = useState<Action | null>(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const [invoiceRes, itemsRes, txRes, auditRes] = await Promise.all([
      supabase.from('invoices').select('*, customers(*)').eq('id', id).maybeSingle(),
      supabase.from('invoice_items').select('*').eq('invoice_id', id).order('position', { ascending: true }),
      supabase.from('transactions').select('*').eq('invoice_id', id).order('created_at', { ascending: false }),
      supabase.from('audit_logs').select('*').eq('entity_id', id).order('created_at', { ascending: false }).limit(20),
    ]);
    if (invoiceRes.error || itemsRes.error || txRes.error || auditRes.error) {
      setError('We could not load this invoice. Please refresh the page.');
      return;
    }
    if (!invoiceRes.data) {
      setNotFound(true);
      return;
    }
    const { customers, ...invoice } = invoiceRes.data as Invoice & { customers: Customer | null };
    setData({
      invoice,
      customer: customers,
      items: (itemsRes.data ?? []) as InvoiceItem[],
      transactions: (txRes.data ?? []) as Transaction[],
      audit: (auditRes.data ?? []) as AuditLog[],
    });
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction(action: Action) {
    if (!data) return;
    setWorking(true);
    const invoiceId = data.invoice.id;
    let errorMessage: string | null = null;
    if (action === 'open') {
      if (data.items.length === 0 || sumItemsCents(data.items) <= 0) {
        errorMessage = 'Add at least one line item with an amount before confirming.';
      } else {
        const { error: updateError } = await supabase.from('invoices').update({ status: 'open' }).eq('id', invoiceId).eq('status', 'draft');
        if (updateError) errorMessage = 'We could not confirm the invoice. Please try again.';
      }
    } else if (action === 'cancel') {
      const { error: updateError } = await supabase.from('invoices').update({ status: 'cancelled' }).eq('id', invoiceId);
      if (updateError) errorMessage = 'We could not cancel the invoice. Please try again.';
    } else {
      const { error: deleteError } = await supabase.from('invoices').delete().eq('id', invoiceId).eq('status', 'draft');
      if (deleteError) errorMessage = 'We could not delete the draft. Please try again.';
    }
    setWorking(false);
    setPendingAction(null);
    if (errorMessage) {
      notify(errorMessage, 'error');
      return;
    }
    if (action === 'delete') {
      notify('Draft deleted.', 'success');
      navigate('/invoices');
      return;
    }
    notify(action === 'open' ? 'Invoice confirmed. The payment link is ready.' : 'Invoice cancelled.', 'success');
    load();
  }

  function copyLink() {
    if (!data) return;
    const link = `${window.location.origin}/pay/${data.invoice.public_token}`;
    navigator.clipboard.writeText(link).then(
      () => notify('Payment link copied.', 'success'),
      () => notify('Copy failed. Select the link and copy it manually.', 'error')
    );
  }

  if (error) {
    return (
      <>
        <PageHeader title="Invoice" />
        <Alert tone="error">{error}</Alert>
      </>
    );
  }

  if (notFound) {
    return (
      <EmptyState
        icon={FileText}
        title="Invoice not found"
        description="This invoice may have been deleted, or the link is incorrect."
        action={<Link to="/invoices"><Button variant="secondary">Back to invoices</Button></Link>}
      />
    );
  }

  if (!data) {
    return (
      <>
        <PageHeader title="Invoice" />
        <Card padded={false}><LoadingRows rows={4} /></Card>
      </>
    );
  }

  const { invoice, customer, items, transactions, audit } = data;
  const subtotal = sumItemsCents(items);
  const overdue = isOverdue(invoice.due_date, invoice.status);
  const copy = pendingAction ? ACTION_COPY[pendingAction] : null;

  return (
    <>
      <PageHeader
        title={invoice.invoice_number}
        description={invoice.title}
        action={
          <div className="flex flex-wrap gap-3">
            {invoice.status === 'draft' && (
              <>
                <Link to={`/invoices/${invoice.id}/edit`}><Button variant="secondary" icon={<Pencil className="h-4 w-4" aria-hidden="true" />}>Edit</Button></Link>
                <Button variant="accent" icon={<Send className="h-4 w-4" aria-hidden="true" />} onClick={() => setPendingAction('open')}>Confirm invoice</Button>
                <Button variant="ghost" icon={<Trash2 className="h-4 w-4" aria-hidden="true" />} onClick={() => setPendingAction('delete')}>Delete</Button>
              </>
            )}
            {invoice.status === 'open' && (
              <Button variant="danger" icon={<XCircle className="h-4 w-4" aria-hidden="true" />} onClick={() => setPendingAction('cancel')}>Cancel invoice</Button>
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-navy-400">Total</p>
                <p className="mt-1 text-3xl font-semibold tabular-nums text-navy-900">{formatMoney(subtotal, invoice.currency)}</p>
              </div>
              <InvoiceStatusBadge status={invoice.status} overdue={overdue} />
            </div>
            <dl className="mt-6 grid gap-4 border-t border-navy-100 pt-6 text-sm sm:grid-cols-3">
              <div><dt className="text-navy-500">Customer</dt><dd className="mt-1 font-medium text-navy-900">{customer?.name ?? '—'}</dd></div>
              <div><dt className="text-navy-500">Due date</dt><dd className="mt-1 font-medium text-navy-900">{formatDate(invoice.due_date)}</dd></div>
              <div><dt className="text-navy-500">Created</dt><dd className="mt-1 font-medium text-navy-900">{formatDateTime(invoice.created_at)}</dd></div>
              {invoice.paid_at && <div><dt className="text-navy-500">Paid</dt><dd className="mt-1 font-medium text-emerald-700">{formatDateTime(invoice.paid_at)}</dd></div>}
            </dl>
          </Card>

          <Card padded={false}>
            <div className="p-6 pb-0"><CardTitle title="Line items" /></div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs font-semibold uppercase tracking-wide text-navy-500">
                  <tr className="border-b border-navy-100">
                    <th scope="col" className="px-6 py-3">Description</th>
                    <th scope="col" className="px-6 py-3 text-right">Qty</th>
                    <th scope="col" className="px-6 py-3 text-right">Unit</th>
                    <th scope="col" className="px-6 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-100">
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-6 py-3 text-navy-800">{item.description}</td>
                      <td className="px-6 py-3 text-right tabular-nums">{item.quantity}</td>
                      <td className="px-6 py-3 text-right tabular-nums">{formatMoney(item.unit_price_cents, invoice.currency)}</td>
                      <td className="px-6 py-3 text-right font-medium tabular-nums">{formatMoney(item.quantity * item.unit_price_cents, invoice.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardTitle title="Payments" description="Each PayPal attempt is verified on the server before the invoice is marked paid." />
            {transactions.length === 0 ? (
              <p className="text-sm text-navy-500">No payment attempts yet.</p>
            ) : (
              <ul className="divide-y divide-navy-100">
                {transactions.map((tx) => (
                  <li key={tx.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                    <div>
                      <p className="font-medium text-navy-900">{formatMoney(tx.amount_cents, tx.currency)}</p>
                      <p className="text-xs text-navy-500">{formatDateTime(tx.created_at)} · {tx.payer_email ?? 'Payer pending'}</p>
                      {tx.failure_reason && <p className="mt-1 text-xs text-red-600">{tx.failure_reason}</p>}
                    </div>
                    <TransactionStatusBadge status={tx.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardTitle title="Payment link" description={invoice.status === 'draft' ? 'Available after you confirm the invoice.' : 'Send this link to your customer.'} />
            {invoice.status === 'draft' || invoice.status === 'cancelled' ? (
              <p className="text-sm text-navy-500">
                {invoice.status === 'draft' ? 'Confirm the invoice to activate its payment link.' : 'Cancelled invoices cannot be paid.'}
              </p>
            ) : (
              <div className="space-y-3">
                <p className="break-all rounded-lg bg-navy-50 p-3 font-mono text-xs text-navy-700">{`${window.location.origin}/pay/${invoice.public_token}`}</p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" icon={<Copy className="h-4 w-4" aria-hidden="true" />} onClick={copyLink}>Copy link</Button>
                  <a href={`/pay/${invoice.public_token}`} target="_blank" rel="noreferrer">
                    <Button variant="ghost" size="sm" icon={<ExternalLink className="h-4 w-4" aria-hidden="true" />}>Open</Button>
                  </a>
                </div>
              </div>
            )}
          </Card>

          {invoice.ai_payment_message && (
            <Card>
              <CardTitle title="Payment message" />
              <p className="text-sm leading-relaxed text-navy-700">{invoice.ai_payment_message}</p>
            </Card>
          )}

          <Card>
            <CardTitle title="Activity" />
            {audit.length === 0 ? (
              <p className="text-sm text-navy-500">No activity recorded yet.</p>
            ) : (
              <ol className="space-y-3">
                {audit.map((entry) => (
                  <li key={entry.id} className="text-sm">
                    <p className="font-medium text-navy-800">{entry.action.replace(/[._]/g, ' ')}</p>
                    <p className="text-xs text-navy-500">{formatDateTime(entry.created_at)}</p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </aside>
      </div>

      <Modal
        open={pendingAction !== null}
        onClose={() => !working && setPendingAction(null)}
        title={copy?.title ?? ''}
        description={copy?.body}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPendingAction(null)} disabled={working}>Keep it</Button>
            <Button
              variant={copy?.danger ? 'danger' : 'accent'}
              loading={working}
              onClick={() => pendingAction && runAction(pendingAction)}
            >
              {copy?.confirm}
            </Button>
          </>
        }
      >
        {overdue && <p className="text-sm text-navy-600">This invoice is past its due date.</p>}
      </Modal>
    </>
  );
}
