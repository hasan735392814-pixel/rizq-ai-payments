import type { Currency, InvoiceStatus, TransactionStatus } from '@/types/database';

export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

export function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function isOverdue(dueDate: string | null, status: InvoiceStatus): boolean {
  if (!dueDate || status !== 'open') return false;
  return dueDate < new Date().toISOString().slice(0, 10);
}

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  open: 'Awaiting payment',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

export const TRANSACTION_STATUS_LABEL: Record<TransactionStatus, string> = {
  created: 'Started',
  capturing: 'Processing',
  completed: 'Completed',
  pending: 'Pending review',
  declined: 'Declined',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export const CURRENCY_OPTIONS: Currency[] = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];
