import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Clock, ShieldCheck, XCircle } from 'lucide-react';
import { callFunction, ApiError } from '@/lib/functions';
import { formatDate, formatMoney, INVOICE_STATUS_LABEL } from '@/lib/format';
import type { PublicInvoice, PayPalStatus } from '@/types/database';
import { Card } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { LoadingRows } from '@/components/ui/EmptyState';
import { BrandLogo } from '@/components/layout/BrandLogo';
import { loadPayPalSdk, type PayPalButtons } from '@/lib/paypalSdk';

type CaptureResult = {
  status: 'completed' | 'pending' | 'processing' | 'declined' | 'failed' | 'created' | 'capturing';
  message?: string;
  retryable?: boolean;
};

const POLL_INTERVAL_MS = 3000;
const POLL_ATTEMPTS = 10;

export function PayInvoice() {
  const { token = '' } = useParams<{ token: string }>();
  const [invoice, setInvoice] = useState<PublicInvoice | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sdkStatus, setSdkStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [sdkMessage, setSdkMessage] = useState<string | null>(null);
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [paying, setPaying] = useState(false);
  const buttonsRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    callFunction<PublicInvoice>('/paypal/invoice', { query: { token } })
      .then((data) => {
        if (active) setInvoice(data);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setLoadError(err instanceof ApiError && err.status === 404 ? 'This payment link is not valid or the invoice is not open for payment.' : 'We could not load this invoice. Please try again later.');
      });
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!invoice || invoice.invoice.status !== 'open') return;
    let active = true;
    setSdkStatus('loading');
    callFunction<PayPalStatus>('/paypal/status')
      .then((status) => {
        if (!status.configured || !status.clientId) throw new Error('PayPal is not configured yet.');
        return loadPayPalSdk(status.clientId, invoice.invoice.currency);
      })
      .then((paypal) => {
        if (!active || !buttonsRef.current) return;
        const buttons: PayPalButtons = paypal.Buttons({
          style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'pay', height: 48 },
          createOrder: async () => {
            setSdkMessage(null);
            setPaying(true);
            const { orderId } = await callFunction<{ orderId: string }>('/paypal/create-order', {
              method: 'POST',
              body: { token },
            });
            return orderId;
          },
          onApprove: async (data) => {
            try {
              const capture = await callFunction<CaptureResult>('/paypal/capture-order', {
                method: 'POST',
                body: { token, orderId: data.orderID },
              });
              setResult(capture);
              if (capture.status === 'pending' || capture.status === 'processing' || capture.status === 'capturing') {
                pollStatus(data.orderID);
              }
            } catch (err) {
              setSdkMessage(err instanceof Error ? err.message : 'The payment could not be completed.');
            } finally {
              setPaying(false);
            }
          },
          onCancel: () => {
            setPaying(false);
            setSdkMessage('You cancelled the PayPal payment. Your invoice is still open, so you can try again.');
          },
          onError: () => {
            setPaying(false);
            setSdkMessage('PayPal ran into a problem. Please try again in a moment.');
          },
        });
        if (buttons.isEligible()) {
          buttons.render(buttonsRef.current);
          setSdkStatus('ready');
        } else {
          setSdkStatus('error');
          setSdkMessage('PayPal checkout is not available in this browser. Try another browser.');
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        setSdkStatus('error');
        setSdkMessage(err instanceof Error ? err.message : 'PayPal is unavailable right now.');
      });
    return () => {
      active = false;
    };
    // pollStatus is stable within this effect's lifetime; the effect should only rerun when the invoice changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice, token]);

  useEffect(() => () => {
    if (pollRef.current !== null) window.clearTimeout(pollRef.current);
  }, []);

  function pollStatus(orderId: string, attempt = 0) {
    if (attempt >= POLL_ATTEMPTS) {
      setResult({ status: 'pending', message: 'Your payment is still being confirmed by PayPal. Refresh this page in a few minutes.' });
      return;
    }
    pollRef.current = window.setTimeout(async () => {
      try {
        const { status } = await callFunction<{ status: CaptureResult['status'] }>(`/paypal/order/${orderId}`, { query: { token } });
        if (status === 'completed' || status === 'declined' || status === 'failed') {
          setResult({ status });
          return;
        }
      } catch {
        // transient lookup failure; keep polling until the attempt limit
      }
      pollStatus(orderId, attempt + 1);
    }, POLL_INTERVAL_MS);
  }

  if (loadError) {
    return <Shell><Alert tone="error" title="Payment link unavailable">{loadError}</Alert></Shell>;
  }

  if (!invoice) {
    return <Shell><Card padded={false}><LoadingRows rows={5} /></Card></Shell>;
  }

  const { invoice: details, business, customer, items } = invoice;
  const isPaid = details.status === 'paid' || result?.status === 'completed';
  const isOpen = details.status === 'open' && !isPaid;

  return (
    <Shell>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-navy-400">Invoice {details.invoiceNumber}</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-navy-900">{details.title}</h1>
              <p className="mt-1 text-sm text-navy-500">From {business?.name ?? 'Rizq AI Payments seller'}</p>
            </div>
            <span className="rounded-full bg-navy-100 px-3 py-1 text-xs font-medium text-navy-700">
              {INVOICE_STATUS_LABEL[isPaid ? 'paid' : details.status]}
            </span>
          </div>

          <div className="mt-6 grid gap-4 border-t border-navy-100 pt-6 text-sm sm:grid-cols-2">
            <div>
              <p className="text-navy-500">Billed to</p>
              <p className="mt-1 font-medium text-navy-900">{customer?.name ?? '—'}</p>
              {customer?.company && <p className="text-navy-600">{customer.company}</p>}
            </div>
            <div>
              <p className="text-navy-500">Due date</p>
              <p className="mt-1 font-medium text-navy-900">{formatDate(details.dueDate)}</p>
            </div>
          </div>

          {details.description && <p className="mt-6 text-sm leading-relaxed text-navy-700">{details.description}</p>}

          <ul className="mt-6 divide-y divide-navy-100 border-t border-navy-100">
            {items.map((item, index) => (
              <li key={index} className="flex items-center justify-between gap-4 py-3 text-sm">
                <span className="text-navy-800">{item.description} <span className="text-navy-400">× {item.quantity}</span></span>
                <span className="font-medium tabular-nums text-navy-900">{formatMoney(item.quantity * item.unitPriceCents, details.currency)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center justify-between border-t border-navy-100 pt-4">
            <span className="text-sm font-medium text-navy-600">Total due</span>
            <span className="text-2xl font-semibold tabular-nums text-navy-900">{formatMoney(details.totalCents, details.currency)}</span>
          </div>
        </Card>

        <Card className="h-fit lg:sticky lg:top-8">
          {isPaid && (
            <div className="space-y-3 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-navy-900">Payment received</h2>
              <p className="text-sm text-navy-600">Thank you. This invoice is marked as paid.</p>
            </div>
          )}

          {!isPaid && details.status === 'cancelled' && (
            <div className="space-y-3 text-center">
              <XCircle className="mx-auto h-12 w-12 text-navy-400" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-navy-900">This invoice was cancelled</h2>
              <p className="text-sm text-navy-600">No payment is needed. Contact the seller if you have questions.</p>
            </div>
          )}

          {isOpen && (
            <div className="space-y-5">
              <div>
                <h2 className="text-base font-semibold text-navy-900">Pay securely with PayPal</h2>
                <p className="mt-1 text-sm text-navy-500">You will approve the payment on PayPal. The amount is checked again on our server.</p>
              </div>
              {paying && <p className="text-sm font-medium text-emerald-700" role="status">Processing your payment…</p>}
              <div ref={buttonsRef} className="min-h-[48px]" />
              {sdkStatus === 'loading' && <div className="skeleton h-12 w-full" aria-label="Loading PayPal" />}
              {sdkMessage && <Alert tone={sdkStatus === 'error' ? 'error' : 'warning'}>{sdkMessage}</Alert>}
              {result && result.status !== 'completed' && (
                <Alert tone={result.status === 'pending' || result.status === 'processing' || result.status === 'capturing' ? 'info' : 'error'}>
                  {result.message ?? (result.status === 'declined' ? 'This payment method was declined. Please try another one.' : 'Your payment was not completed.')}
                  {result.status !== 'pending' && (
                    <Button variant="secondary" size="sm" className="mt-3" onClick={() => { setResult(null); setSdkMessage(null); }}>
                      Dismiss
                    </Button>
                  )}
                </Alert>
              )}
            </div>
          )}

          {!isOpen && !isPaid && details.status !== 'cancelled' && (
            <p className="text-sm text-navy-600">This invoice is not open for payment yet.</p>
          )}

          <div className="mt-6 flex items-center gap-2 border-t border-navy-100 pt-5 text-xs text-navy-500">
            <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            Payments are processed by PayPal. Card details never reach this site.
          </div>
          {result?.status === 'pending' && (
            <p className="mt-3 flex items-center gap-2 text-xs text-navy-500"><Clock className="h-4 w-4" aria-hidden="true" />We will update this page once PayPal confirms the payment.</p>
          )}
        </Card>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-navy-50/60 px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-5xl space-y-8">
        <BrandLogo />
        {children}
      </div>
    </div>
  );
}
