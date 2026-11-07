import { describe, expect, it } from 'vitest';
import { invoiceTotalCents, parseAmountToCents, validateInvoiceDraft } from '@/lib/invoiceMath';

describe('invoiceTotalCents', () => {
  it('sums quantity times unit price for every line', () => {
    expect(
      invoiceTotalCents([
        { description: 'Design', quantity: 2, unitPriceCents: 15000 },
        { description: 'Hosting', quantity: 1, unitPriceCents: 4999 },
      ])
    ).toBe(34999);
  });

  it('returns zero for no items', () => {
    expect(invoiceTotalCents([])).toBe(0);
  });
});

describe('parseAmountToCents', () => {
  it('converts decimal amounts to integer cents without float error', () => {
    expect(parseAmountToCents('0.1')).toBe(10);
    expect(parseAmountToCents('19.99')).toBe(1999);
    expect(parseAmountToCents('250')).toBe(25000);
  });

  it('rejects malformed amounts', () => {
    expect(parseAmountToCents('12.345')).toBeNull();
    expect(parseAmountToCents('-5')).toBeNull();
    expect(parseAmountToCents('abc')).toBeNull();
  });
});

describe('validateInvoiceDraft', () => {
  it('accepts a complete draft', () => {
    expect(validateInvoiceDraft('Website build', [{ description: 'Build', quantity: 1, unitPriceCents: 100 }])).toEqual([]);
  });

  it('reports missing title, items and zero totals', () => {
    const errors = validateInvoiceDraft('', [{ description: '', quantity: 0, unitPriceCents: 0 }]);
    expect(errors).toContain('Add an invoice title.');
    expect(errors).toContain('Line 1 needs a description.');
    expect(errors).toContain('Line 1 needs a quantity of at least 1.');
    expect(errors).toContain('The invoice total must be greater than zero.');
  });
});
