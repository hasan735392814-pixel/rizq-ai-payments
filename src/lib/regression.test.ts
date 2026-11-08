import { describe, expect, it } from 'vitest';
import { validateInvoiceDraft, parseAmountToCents } from '@/lib/invoiceMath';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';

describe('BUG 1 regression: invoice confirmation requires valid items', () => {
  it('rejects confirmation when line items are empty', () => {
    const errors = validateInvoiceDraft('Valid title', []);
    expect(errors).toContain('The invoice total must be greater than zero.');
  });

  it('rejects confirmation when total is zero', () => {
    const errors = validateInvoiceDraft('Valid title', [
      { description: 'Item', quantity: 1, unitPriceCents: 0 },
    ]);
    expect(errors).toContain('The invoice total must be greater than zero.');
  });

  it('accepts confirmation when all fields are valid', () => {
    const errors = validateInvoiceDraft('Valid title', [
      { description: 'Consulting', quantity: 5, unitPriceCents: 20000 },
    ]);
    expect(errors).toEqual([]);
  });
});

describe('BUG 2 regression: form validation prevents invalid submissions', () => {
  it('rejects zero-quantity line items before any API call', () => {
    const errors = validateInvoiceDraft('Title', [
      { description: 'Bad', quantity: 0, unitPriceCents: 100 },
    ]);
    expect(errors).toContain('Line 1 needs a quantity of at least 1.');
  });

  it('rejects negative unit prices', () => {
    const cents = parseAmountToCents('-10.00');
    expect(cents).toBeNull();
  });

  it('rejects empty descriptions', () => {
    const errors = validateInvoiceDraft('Title', [
      { description: '', quantity: 1, unitPriceCents: 100 },
    ]);
    expect(errors).toContain('Line 1 needs a description.');
  });
});

describe('BUG 2 regression: ErrorBoundary catches errors and shows recovery', () => {
  it('getDerivedStateFromError sets hasError to true', () => {
    const state = ErrorBoundary.getDerivedStateFromError(new Error('test crash'));
    expect(state.hasError).toBe(true);
    expect(state.message).toBe('test crash');
  });

  it('initial state has hasError false', () => {
    const instance = new ErrorBoundary({ children: null });
    expect(instance.state.hasError).toBe(false);
  });
});
