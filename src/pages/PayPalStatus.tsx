import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, RefreshCw, ShieldCheck } from 'lucide-react';
import { callFunction, ApiError } from '@/lib/functions';
import type { PayPalStatus } from '@/types/database';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { LoadingRows } from '@/components/ui/EmptyState';
import { formatDateTime } from '@/lib/format';

const SANDBOX_STEPS = [
  'Sign in to developer.paypal.com with your PayPal developer account.',
  'Open Sandbox > Accounts and copy an email for a Personal (buyer) account.',
  'Open the payment link from an invoice in a private browser window.',
  'Choose PayPal, sign in with the sandbox buyer account, and approve the payment.',
  'Return here: the invoice switches to Paid after the server verifies the capture.',
];

export function PayPalStatus() {
  const [status, setStatus] = useState<PayPalStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const check = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      setStatus(await callFunction<PayPalStatus>('/paypal/status'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'We could not reach the payment service.');
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  return (
    <>
      <PageHeader
        title="PayPal connection"
        description="Live check of your PayPal Sandbox connection. Secrets stay on the server and are never shown here."
        action={
          <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" aria-hidden="true" />} onClick={check} loading={checking}>
            Check again
          </Button>
        }
      />

      {error && <Alert tone="error" title="Status unavailable">{error}</Alert>}

      {!status && !error && (
        <Card padded={false}><LoadingRows rows={3} /></Card>
      )}

      {status && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <Card>
            <CardTitle title="Connection" description={`Checked ${formatDateTime(status.checkedAt)}`} />
            <dl className="space-y-4 text-sm">
              <StatusRow label="Credentials saved" ok={status.configured} okText="Yes" badText="Missing" />
              <StatusRow label="Authenticated with PayPal" ok={status.authenticated} okText="Connected" badText="Not connected" />
              <div className="flex items-center justify-between gap-4">
                <dt className="text-navy-500">Environment</dt>
                <dd>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${status.environment === 'sandbox' ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}`}>
                    {status.environment === 'sandbox' ? 'Sandbox (test money only)' : 'Live'}
                  </span>
                </dd>
              </div>
            </dl>
            {!status.configured && (
              <Alert tone="warning" title="PayPal is not configured yet">
                Add your PayPal Sandbox credentials to the project settings, then press Check again.
              </Alert>
            )}
          </Card>

          <Card>
            <CardTitle title="Test a payment in Sandbox" description="Use a sandbox buyer account. No real money moves." />
            <ol className="space-y-4">
              {SANDBOX_STEPS.map((step, index) => (
                <li key={step} className="flex gap-3 text-sm leading-relaxed text-navy-700">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy-100 text-xs font-semibold text-navy-700">{index + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
            <div className="mt-6 flex items-start gap-2 rounded-xl bg-emerald-50/70 p-4 text-xs text-emerald-900">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
              Invoices are marked paid only after the server confirms a completed capture with the exact invoice amount and currency.
            </div>
            <div className="mt-3 flex items-start gap-2 text-xs text-navy-500">
              {status.authenticated ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />}
              {status.authenticated ? 'PayPal accepted the server credentials.' : 'Payments are unavailable until PayPal accepts the credentials.'}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

function StatusRow({ label, ok, okText, badText }: { label: string; ok: boolean; okText: string; badText: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-navy-500">{label}</dt>
      <dd className={`font-medium ${ok ? 'text-emerald-700' : 'text-red-600'}`}>{ok ? okText : badText}</dd>
    </div>
  );
}
