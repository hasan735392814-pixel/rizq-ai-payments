import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { callFunction, ApiError } from '@/lib/functions';
import { CURRENCY_OPTIONS } from '@/lib/format';
import { centsToInput, parseAmountToCents } from '@/lib/invoiceMath';
import type { Currency } from '@/types/database';
import { Button } from '@/components/ui/Button';
import { Alert } from '@/components/ui/Alert';
import { FormField, inputClassName } from '@/components/ui/Field';

export interface InvoiceWording {
  title: string;
  description: string;
  layout: string;
  paymentMessage: string;
  explanation: string;
}

interface AiDraftPanelProps {
  defaultCustomerName: string;
  defaultProduct: string;
  defaultUnitPriceCents: number;
  defaultQuantity: number;
  defaultCurrency: Currency;
  defaultDueDate: string;
  onApply: (wording: InvoiceWording) => void;
}

export function AiDraftPanel({
  defaultCustomerName,
  defaultProduct,
  defaultUnitPriceCents,
  defaultQuantity,
  defaultCurrency,
  defaultDueDate,
  onApply,
}: AiDraftPanelProps) {
  const [customerName, setCustomerName] = useState(defaultCustomerName);
  const [product, setProduct] = useState(defaultProduct);
  const [unitPrice, setUnitPrice] = useState(centsToInput(defaultUnitPriceCents));
  const [quantity, setQuantity] = useState(String(defaultQuantity));
  const [currency, setCurrency] = useState<Currency>(defaultCurrency);
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [instructions, setInstructions] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<InvoiceWording | null>(null);

  async function generate() {
    setError(null);
    const priceCents = parseAmountToCents(unitPrice);
    const qty = Number(quantity);
    if (!customerName.trim() || !product.trim()) {
      setError('Add a customer name and what you are selling first.');
      return;
    }
    if (priceCents === null || !Number.isInteger(qty) || qty < 1) {
      setError('Enter a valid price and a quantity of at least 1.');
      return;
    }
    setLoading(true);
    try {
      const result = await callFunction<InvoiceWording>('/ai/invoice-draft', {
        method: 'POST',
        body: {
          customerName: customerName.trim(),
          product: product.trim(),
          unitPrice: priceCents / 100,
          quantity: qty,
          currency,
          dueDate: dueDate || null,
          instructions: instructions.trim() || null,
        },
      });
      setDraft(result);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'AI could not write the wording right now.';
      setError(`${message} You can still write the invoice manually.`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5 rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/70 to-white p-5 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-navy-900">Write it with AI</h3>
          <p className="mt-0.5 text-xs leading-relaxed text-navy-500">
            AI drafts the title, description and payment message. It never sets your amounts; you confirm every number.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Customer name" htmlFor="ai-customer">
          <input id="ai-customer" className={inputClassName} value={customerName} onChange={(e) => setCustomerName(e.target.value)} maxLength={120} />
        </FormField>
        <FormField label="What you are selling" htmlFor="ai-product">
          <input id="ai-product" className={inputClassName} value={product} onChange={(e) => setProduct(e.target.value)} maxLength={200} />
        </FormField>
        <FormField label="Unit price" htmlFor="ai-price">
          <input id="ai-price" inputMode="decimal" className={inputClassName} value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
        </FormField>
        <FormField label="Quantity" htmlFor="ai-qty">
          <input id="ai-qty" inputMode="numeric" className={inputClassName} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </FormField>
        <FormField label="Currency" htmlFor="ai-currency">
          <select id="ai-currency" className={inputClassName} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
            {CURRENCY_OPTIONS.map((code) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Due date" htmlFor="ai-due">
          <input id="ai-due" type="date" className={inputClassName} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </FormField>
      </div>
      <FormField label="Tone or extra instructions (optional)" htmlFor="ai-instructions" hint="For example: friendly, mention net-14 terms.">
        <input id="ai-instructions" className={inputClassName} value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={500} />
      </FormField>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="accent" onClick={generate} loading={loading} icon={<Sparkles className="h-4 w-4" aria-hidden="true" />}>
          {draft ? 'Regenerate wording' : 'Generate wording'}
        </Button>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {draft && (
        <div className="space-y-3 rounded-xl border border-navy-100 bg-white p-4 text-sm">
          <p><span className="font-semibold text-navy-900">Title:</span> <span className="text-navy-700">{draft.title}</span></p>
          <p><span className="font-semibold text-navy-900">Description:</span> <span className="text-navy-700">{draft.description}</span></p>
          <p><span className="font-semibold text-navy-900">Payment message:</span> <span className="text-navy-700">{draft.paymentMessage}</span></p>
          <p className="text-xs text-navy-500">{draft.explanation}</p>
          <Button variant="secondary" size="sm" onClick={() => onApply(draft)}>
            Use this wording
          </Button>
        </div>
      )}
    </div>
  );
}
