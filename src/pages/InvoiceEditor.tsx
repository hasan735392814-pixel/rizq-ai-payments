import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { CURRENCY_OPTIONS, formatMoney } from '@/lib/format';
import {
  centsToInput,
  invoiceTotalCents,
  lineTotalCents,
  parseAmountToCents,
  validateInvoiceDraft,
  type DraftLineItem,
} from '@/lib/invoiceMath';
import { useAuth } from '@/context/useAuth';
import { useToast } from '@/context/useToast';
import type { Currency, Customer, Invoice, InvoiceItem } from '@/types/database';
import { AiDraftPanel, type InvoiceWording } from '@/components/invoices/AiDraftPanel';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { FormField, inputClassName } from '@/components/ui/Field';
import { LoadingRows } from '@/components/ui/EmptyState';

interface LineState {
  key: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

interface FormState {
  customerId: string;
  title: string;
  description: string;
  currency: Currency;
  dueDate: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  customerId: '',
  title: '',
  description: '',
  currency: 'USD',
  dueDate: '',
  notes: '',
};

function newLine(): LineState {
  return { key: crypto.randomUUID(), description: '', quantity: '1', unitPrice: '' };
}

function toDraftItems(lines: LineState[]): (DraftLineItem | null)[] {
  return lines.map((line) => {
    const quantity = Number(line.quantity);
    const unitPriceCents = parseAmountToCents(line.unitPrice);
    if (!Number.isInteger(quantity) || unitPriceCents === null) return null;
    return { description: line.description, quantity, unitPriceCents };
  });
}

export function InvoiceEditor() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { session } = useAuth();
  const { notify } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notDraft, setNotDraft] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [lines, setLines] = useState<LineState[]>([newLine()]);
  const [aiWording, setAiWording] = useState<InvoiceWording | null>(null);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      const customerRes = await supabase.from('customers').select('*').order('name', { ascending: true });
      if (!active) return;
      if (customerRes.error) {
        setLoadError('We could not load your customers.');
        setLoading(false);
        return;
      }
      setCustomers((customerRes.data ?? []) as Customer[]);

      if (!id) {
        setLoading(false);
        return;
      }
      const [invoiceRes, itemsRes] = await Promise.all([
        supabase.from('invoices').select('*').eq('id', id).maybeSingle(),
        supabase.from('invoice_items').select('*').eq('invoice_id', id).order('position', { ascending: true }),
      ]);
      if (!active) return;
      if (invoiceRes.error || itemsRes.error) {
        setLoadError('We could not load this invoice.');
        setLoading(false);
        return;
      }
      const invoice = invoiceRes.data as Invoice | null;
      if (!invoice) {
        setLoadError('This invoice was not found.');
        setLoading(false);
        return;
      }
      if (invoice.status !== 'draft') {
        setNotDraft(true);
        setLoading(false);
        return;
      }
      setForm({
        customerId: invoice.customer_id ?? '',
        title: invoice.title,
        description: invoice.description ?? '',
        currency: invoice.currency,
        dueDate: invoice.due_date ?? '',
        notes: invoice.notes ?? '',
      });
      const items = (itemsRes.data ?? []) as InvoiceItem[];
      setLines(
        items.length > 0
          ? items.map((item) => ({
              key: item.id,
              description: item.description,
              quantity: String(item.quantity),
              unitPrice: centsToInput(item.unit_price_cents),
            }))
          : [newLine()]
      );
      setLoading(false);
    }
    load();
    return () => {
      active = false;
    };
  }, [id]);

  const draftItems = useMemo(() => toDraftItems(lines), [lines]);
  const validItems = draftItems.filter((item): item is DraftLineItem => item !== null);
  const totalCents = invoiceTotalCents(validItems);
  const errors = submitted ? validateInvoiceDraft(form.title, draftItems.map((item) => item ?? { description: '', quantity: 0, unitPriceCents: -1 })) : [];

  const customerName = customers.find((customer) => customer.id === form.customerId)?.name ?? '';
  const firstLine = lines[0];

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function applyWording(wording: InvoiceWording) {
    setAiWording(wording);
    setForm((current) => ({ ...current, title: wording.title, description: wording.description }));
    notify('AI wording applied. Review it before you save.', 'success');
  }

  async function save() {
    setSubmitted(true);
    if (!session) return;
    const invalid = validateInvoiceDraft(form.title, draftItems.map((item) => item ?? { description: '', quantity: 0, unitPriceCents: -1 }));
    if (invalid.length > 0 || validItems.length !== lines.length) return;

    setSaving(true);
    const header = {
      customer_id: form.customerId || null,
      title: form.title.trim(),
      description: form.description.trim() || null,
      currency: form.currency,
      total_cents: totalCents,
      due_date: form.dueDate || null,
      notes: form.notes.trim() || null,
      ai_payment_message: aiWording?.paymentMessage ?? null,
      ai_explanation: aiWording?.explanation ?? null,
      ai_layout: aiWording?.layout ?? null,
    };

    let invoiceId = id ?? null;
    if (invoiceId) {
      const { error } = await supabase.from('invoices').update(header).eq('id', invoiceId);
      if (error) {
        setSaving(false);
        notify('We could not save the draft. Please try again.', 'error');
        return;
      }
      const { error: deleteError } = await supabase.from('invoice_items').delete().eq('invoice_id', invoiceId);
      if (deleteError) {
        setSaving(false);
        notify('We could not update the line items. Please try again.', 'error');
        return;
      }
    } else {
      const { data, error } = await supabase
        .from('invoices')
        .insert({ ...header, user_id: session.user.id, status: 'draft' })
        .select('id')
        .single();
      if (error || !data) {
        setSaving(false);
        notify('We could not create the invoice. Please try again.', 'error');
        return;
      }
      invoiceId = data.id;
    }

    const rows = validItems.map((item, index) => ({
      invoice_id: invoiceId,
      user_id: session.user.id,
      description: item.description.trim(),
      quantity: item.quantity,
      unit_price_cents: item.unitPriceCents,
      position: index,
    }));
    const { error: itemsError } = await supabase.from('invoice_items').insert(rows);
    setSaving(false);
    if (itemsError) {
      notify('The invoice was saved, but its line items could not be. Open it to try again.', 'error');
      navigate(`/invoices/${invoiceId}`);
      return;
    }
    notify('Draft saved.', 'success');
    navigate(`/invoices/${invoiceId}`);
  }

  if (loading) {
    return (
      <>
        <PageHeader title={isEdit ? 'Edit invoice' : 'New invoice'} />
        <Card padded={false}><LoadingRows rows={5} /></Card>
      </>
    );
  }

  if (loadError || notDraft) {
    return (
      <>
        <PageHeader title="Edit invoice" />
        <Alert tone={notDraft ? 'info' : 'error'} title={notDraft ? 'This invoice can no longer be edited' : 'Something went wrong'}>
          {notDraft
            ? 'Only drafts can be changed. Confirmed invoices are locked so your customer always sees the amount you sent.'
            : loadError}
          <div className="pt-3">
            <Link to="/invoices" className="font-medium text-emerald-700 hover:text-emerald-600">Back to invoices</Link>
          </div>
        </Alert>
      </>
    );
  }

  const fieldError = (message: string) => (submitted && message ? message : undefined);

  return (
    <>
      <PageHeader
        title={isEdit ? 'Edit draft' : 'New invoice'}
        description="Add what you are billing, confirm each amount, then save. You can open the invoice to share the payment link once it is confirmed."
        action={
          <div className="flex gap-3">
            <Link to={isEdit ? `/invoices/${id}` : '/invoices'}>
              <Button variant="secondary">Cancel</Button>
            </Link>
            <Button variant="accent" onClick={save} loading={saving}>Save draft</Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          {errors.length > 0 && (
            <Alert tone="error" title="Please fix these before saving">
              <ul className="list-disc space-y-1 pl-5">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </Alert>
          )}

          <Card>
            <CardTitle title="Details" description="Who this invoice is for and what it covers." />
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="Customer" htmlFor="customer">
                <select id="customer" className={inputClassName} value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
                  <option value="">No customer selected</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>{customer.name}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Invoice title" htmlFor="title" error={fieldError(form.title.trim() ? '' : 'Add an invoice title.')}>
                <input id="title" className={inputClassName} value={form.title} maxLength={160} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </FormField>
              <FormField label="Currency" htmlFor="currency">
                <select id="currency" className={inputClassName} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as Currency })}>
                  {CURRENCY_OPTIONS.map((code) => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Due date" htmlFor="due">
                <input id="due" type="date" className={inputClassName} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </FormField>
              <div className="sm:col-span-2">
                <FormField label="Description shown to the customer" htmlFor="description">
                  <textarea id="description" rows={3} className={inputClassName} value={form.description} maxLength={2000} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </FormField>
              </div>
              <div className="sm:col-span-2">
                <FormField label="Internal notes" htmlFor="notes" hint="Only you can see these notes.">
                  <textarea id="notes" rows={2} className={inputClassName} value={form.notes} maxLength={2000} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </FormField>
              </div>
            </div>
          </Card>

          <Card>
            <CardTitle
              title="Line items"
              description="Quantities and prices are stored in cents, so totals never drift."
              action={
                <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" aria-hidden="true" />} onClick={() => setLines([...lines, newLine()])}>
                  Add line
                </Button>
              }
            />
            <div className="space-y-3">
              {lines.map((line, index) => {
                const parsed = draftItems[index];
                return (
                  <div key={line.key} className="grid grid-cols-12 items-start gap-3 rounded-xl border border-navy-100 bg-navy-50/40 p-3 sm:p-4">
                    <div className="col-span-12 sm:col-span-5">
                      <label className="mb-1 block text-xs font-medium text-navy-600" htmlFor={`desc-${line.key}`}>Description</label>
                      <input id={`desc-${line.key}`} className={inputClassName} value={line.description} maxLength={200} onChange={(e) => updateLine(line.key, { description: e.target.value })} />
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-navy-600" htmlFor={`qty-${line.key}`}>Qty</label>
                      <input id={`qty-${line.key}`} inputMode="numeric" className={inputClassName} value={line.quantity} onChange={(e) => updateLine(line.key, { quantity: e.target.value })} />
                    </div>
                    <div className="col-span-5 sm:col-span-3">
                      <label className="mb-1 block text-xs font-medium text-navy-600" htmlFor={`price-${line.key}`}>Unit price</label>
                      <input id={`price-${line.key}`} inputMode="decimal" placeholder="0.00" className={inputClassName} value={line.unitPrice} onChange={(e) => updateLine(line.key, { unitPrice: e.target.value })} />
                    </div>
                    <div className="col-span-3 flex items-end justify-end gap-2 sm:col-span-2">
                      <p className="pb-2.5 text-sm font-semibold tabular-nums text-navy-900">
                        {parsed ? formatMoney(lineTotalCents(parsed), form.currency) : '—'}
                      </p>
                      <button
                        type="button"
                        aria-label={`Remove line ${index + 1}`}
                        disabled={lines.length === 1}
                        onClick={() => setLines(lines.filter((item) => item.key !== line.key))}
                        className="rounded-lg p-2 text-navy-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-5 flex items-center justify-between border-t border-navy-100 pt-5">
              <span className="text-sm font-medium text-navy-600">Invoice total</span>
              <span className="text-2xl font-semibold tabular-nums text-navy-900">{formatMoney(totalCents, form.currency)}</span>
            </div>
          </Card>
        </div>

        <aside className="space-y-6">
          <AiDraftPanel
            defaultCustomerName={customerName}
            defaultProduct={firstLine?.description ?? ''}
            defaultUnitPriceCents={firstLine ? (parseAmountToCents(firstLine.unitPrice) ?? 0) : 0}
            defaultQuantity={firstLine ? Number(firstLine.quantity) || 1 : 1}
            defaultCurrency={form.currency}
            defaultDueDate={form.dueDate}
            onApply={applyWording}
          />
          {aiWording && (
            <Card>
              <p className="text-xs text-navy-500">Payment message for the customer:</p>
              <p className="mt-2 text-sm text-navy-800">{aiWording.paymentMessage}</p>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
