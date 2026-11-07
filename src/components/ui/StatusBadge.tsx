import type { InvoiceStatus, TransactionStatus } from '@/types/database';
import { INVOICE_STATUS_LABEL, TRANSACTION_STATUS_LABEL } from '@/lib/format';

const INVOICE_STYLE: Record<InvoiceStatus, string> = {
  draft: 'bg-navy-100 text-navy-700 ring-navy-200',
  open: 'bg-amber-50 text-amber-800 ring-amber-200',
  paid: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cancelled: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const TRANSACTION_STYLE: Record<TransactionStatus, string> = {
  created: 'bg-navy-100 text-navy-700 ring-navy-200',
  capturing: 'bg-navy-100 text-navy-700 ring-navy-200',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  pending: 'bg-amber-50 text-amber-800 ring-amber-200',
  declined: 'bg-red-50 text-red-700 ring-red-200',
  failed: 'bg-red-50 text-red-700 ring-red-200',
  cancelled: 'bg-slate-100 text-slate-600 ring-slate-200',
};

const BASE = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap';

export function InvoiceStatusBadge({ status, overdue = false }: { status: InvoiceStatus; overdue?: boolean }) {
  if (overdue) {
    return <span className={`${BASE} bg-red-50 text-red-700 ring-red-200`}>Overdue</span>;
  }
  return <span className={`${BASE} ${INVOICE_STYLE[status]}`}>{INVOICE_STATUS_LABEL[status]}</span>;
}

export function TransactionStatusBadge({ status }: { status: TransactionStatus }) {
  return <span className={`${BASE} ${TRANSACTION_STYLE[status]}`}>{TRANSACTION_STATUS_LABEL[status]}</span>;
}
