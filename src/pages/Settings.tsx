import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/useAuth';
import { useToast } from '@/context/useToast';
import { CURRENCY_OPTIONS } from '@/lib/format';
import type { Currency } from '@/types/database';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { FormField, inputClassName } from '@/components/ui/Field';

interface BusinessForm {
  name: string;
  email: string;
  phone: string;
  address: string;
  currency: Currency;
}

export function Settings() {
  const { session, business, reloadBusiness, businessError } = useAuth();
  const { notify } = useToast();
  const [form, setForm] = useState<BusinessForm>({ name: '', email: '', phone: '', address: '', currency: 'USD' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!business) return;
    setForm({
      name: business.name,
      email: business.email ?? '',
      phone: business.phone ?? '',
      address: business.address ?? '',
      currency: (business.currency as Currency) ?? 'USD',
    });
  }, [business]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!session) return;
    const name = form.name.trim();
    if (!name) {
      setError('Enter your business name.');
      return;
    }
    const payload = {
      name,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      currency: form.currency,
    };
    setSaving(true);
    setError(null);
    const result = business
      ? await supabase.from('businesses').update(payload).eq('id', business.id)
      : await supabase.from('businesses').insert({ ...payload, user_id: session.user.id });
    setSaving(false);
    if (result.error) {
      setError('We could not save your business profile. Please try again.');
      return;
    }
    await reloadBusiness();
    notify('Business profile saved.', 'success');
  }

  return (
    <>
      <PageHeader title="Settings" description="Your business details appear on every invoice and payment page." />

      {businessError && <Alert tone="error">We could not load your business profile. Refresh the page to try again.</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardTitle title="Business profile" description="Shown to customers on payment pages." />
          <form onSubmit={save} className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FormField label="Business name" htmlFor="b-name">
                <input id="b-name" className={inputClassName} value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </FormField>
            </div>
            <FormField label="Contact email" htmlFor="b-email">
              <input id="b-email" type="email" className={inputClassName} value={form.email} maxLength={160} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </FormField>
            <FormField label="Phone" htmlFor="b-phone">
              <input id="b-phone" className={inputClassName} value={form.phone} maxLength={40} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </FormField>
            <div className="sm:col-span-2">
              <FormField label="Address" htmlFor="b-address">
                <textarea id="b-address" rows={2} className={inputClassName} value={form.address} maxLength={300} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </FormField>
            </div>
            <FormField label="Default currency" htmlFor="b-currency" hint="New invoices start in this currency.">
              <select id="b-currency" className={inputClassName} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as Currency })}>
                {CURRENCY_OPTIONS.map((code) => (
                  <option key={code} value={code}>{code}</option>
                ))}
              </select>
            </FormField>
            <div className="flex items-end justify-end sm:col-span-2">
              <Button type="submit" variant="accent" loading={saving}>Save profile</Button>
            </div>
          </form>
        </Card>

        <Card>
          <CardTitle title="Account" description="Payments are handled by PayPal. Customers never see your login details." />
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-navy-500">Signed in as</dt>
              <dd className="mt-1 break-all font-medium text-navy-900">{session?.user.email ?? '—'}</dd>
            </div>
          </dl>
        </Card>
      </div>
    </>
  );
}
