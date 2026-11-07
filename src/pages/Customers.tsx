import { useEffect, useState, type FormEvent } from 'react';
import { Pencil, Plus, Trash2, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/useAuth';
import { useToast } from '@/context/useToast';
import type { Customer } from '@/types/database';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { Modal } from '@/components/ui/Modal';
import { FormField, inputClassName } from '@/components/ui/Field';
import { EmptyState, LoadingRows } from '@/components/ui/EmptyState';

type CustomerForm = Pick<Customer, 'name' | 'email' | 'phone' | 'company' | 'address' | 'notes'>;

const EMPTY_FORM: CustomerForm = { name: '', email: '', phone: '', company: '', address: '', notes: '' };

function toPayload(form: CustomerForm) {
  return {
    name: form.name.trim(),
    email: form.email?.trim() || null,
    phone: form.phone?.trim() || null,
    company: form.company?.trim() || null,
    address: form.address?.trim() || null,
    notes: form.notes?.trim() || null,
  };
}

export function Customers() {
  const { session } = useAuth();
  const { notify } = useToast();
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Customer | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function loadCustomers() {
    const { data, error: queryError } = await supabase.from('customers').select('*').order('name', { ascending: true });
    if (queryError) {
      setError('We could not load your customers. Please refresh the page.');
      return;
    }
    setError(null);
    setCustomers((data ?? []) as Customer[]);
  }

  useEffect(() => {
    void loadCustomers();
  }, []);

  function openEditor(target: Customer | 'new') {
    setFormError(null);
    setForm(target === 'new' ? EMPTY_FORM : { ...target, email: target.email ?? '', phone: target.phone ?? '', company: target.company ?? '', address: target.address ?? '', notes: target.notes ?? '' });
    setEditing(target);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!session || !editing) return;
    const payload = toPayload(form);
    if (!payload.name) {
      setFormError('Enter the customer name.');
      return;
    }
    setSaving(true);
    setFormError(null);
    const result =
      editing === 'new'
        ? await supabase.from('customers').insert({ ...payload, user_id: session.user.id })
        : await supabase.from('customers').update(payload).eq('id', editing.id);
    setSaving(false);
    if (result.error) {
      setFormError('We could not save this customer. Please try again.');
      return;
    }
    notify(editing === 'new' ? 'Customer added.' : 'Customer updated.', 'success');
    setEditing(null);
    void loadCustomers();
  }

  async function confirmDelete() {
    if (!deleting) return;
    setSaving(true);
    const { error: deleteError } = await supabase.from('customers').delete().eq('id', deleting.id);
    setSaving(false);
    setDeleting(null);
    if (deleteError) {
      notify('We could not delete this customer. Please try again.', 'error');
      return;
    }
    notify('Customer deleted. Their invoices are kept.', 'success');
    void loadCustomers();
  }

  return (
    <>
      <PageHeader
        title="Customers"
        description="The people and companies you invoice. Their details appear on invoices and payment pages."
        action={
          <Button variant="accent" icon={<Plus className="h-4 w-4" aria-hidden="true" />} onClick={() => openEditor('new')}>
            Add customer
          </Button>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}

      <Card padded={false}>
        {!customers && !error && <LoadingRows rows={4} />}
        {customers && customers.length === 0 && (
          <EmptyState
            icon={Users}
            title="No customers yet"
            description="Add a customer once, then pick them whenever you create an invoice."
            action={<Button variant="accent" onClick={() => openEditor('new')}>Add your first customer</Button>}
          />
        )}
        {customers && customers.length > 0 && (
          <ul className="divide-y divide-navy-100">
            {customers.map((customer) => (
              <li key={customer.id} className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-navy-50/50">
                <div className="min-w-0">
                  <p className="font-medium text-navy-900">{customer.name}</p>
                  <p className="truncate text-sm text-navy-500">{[customer.company, customer.email].filter(Boolean).join(' · ') || 'No contact details'}</p>
                </div>
                <div className="flex gap-1">
                  <button type="button" aria-label={`Edit ${customer.name}`} onClick={() => openEditor(customer)} className="rounded-lg p-2 text-navy-400 transition-colors hover:bg-navy-100 hover:text-navy-700">
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button type="button" aria-label={`Delete ${customer.name}`} onClick={() => setDeleting(customer)} className="rounded-lg p-2 text-navy-400 transition-colors hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={editing !== null}
        onClose={() => !saving && setEditing(null)}
        title={editing === 'new' ? 'Add customer' : 'Edit customer'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={saving}>Cancel</Button>
            <Button variant="accent" type="submit" form="customer-form" loading={saving}>Save customer</Button>
          </>
        }
      >
        <form id="customer-form" onSubmit={save} className="grid gap-5 sm:grid-cols-2">
          {formError && <div className="sm:col-span-2"><Alert tone="error">{formError}</Alert></div>}
          <FormField label="Name" htmlFor="c-name" error={null}>
            <input id="c-name" className={inputClassName} value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </FormField>
          <FormField label="Company" htmlFor="c-company">
            <input id="c-company" className={inputClassName} value={form.company ?? ''} maxLength={120} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </FormField>
          <FormField label="Email" htmlFor="c-email">
            <input id="c-email" type="email" className={inputClassName} value={form.email ?? ''} maxLength={160} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </FormField>
          <FormField label="Phone" htmlFor="c-phone">
            <input id="c-phone" className={inputClassName} value={form.phone ?? ''} maxLength={40} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="Address" htmlFor="c-address">
              <input id="c-address" className={inputClassName} value={form.address ?? ''} maxLength={300} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </FormField>
          </div>
          <div className="sm:col-span-2">
            <FormField label="Notes" htmlFor="c-notes" hint="Only visible to you.">
              <textarea id="c-notes" rows={3} className={inputClassName} value={form.notes ?? ''} maxLength={1000} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </FormField>
          </div>
        </form>
      </Modal>

      <Modal
        open={deleting !== null}
        onClose={() => !saving && setDeleting(null)}
        title={`Delete ${deleting?.name ?? 'customer'}?`}
        description="Invoices already issued to this customer are kept, but they will no longer be linked to this record."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)} disabled={saving}>Keep customer</Button>
            <Button variant="danger" onClick={confirmDelete} loading={saving}>Delete customer</Button>
          </>
        }
      >
        <span />
      </Modal>
    </>
  );
}
