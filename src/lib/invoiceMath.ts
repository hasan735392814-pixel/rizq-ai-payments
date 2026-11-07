export interface DraftLineItem {
  description: string;
  quantity: number;
  unitPriceCents: number;
}

export function lineTotalCents(item: DraftLineItem): number {
  return item.quantity * item.unitPriceCents;
}

export function invoiceTotalCents(items: DraftLineItem[]): number {
  return items.reduce((total, item) => total + lineTotalCents(item), 0);
}

export function parseAmountToCents(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, fraction = ''] = trimmed.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function validateInvoiceDraft(title: string, items: DraftLineItem[]): string[] {
  const errors: string[] = [];
  if (title.trim().length === 0) errors.push('Add an invoice title.');
  if (title.trim().length > 160) errors.push('The invoice title must be 160 characters or fewer.');
  if (items.length === 0) errors.push('Add at least one line item.');
  items.forEach((item, index) => {
    const line = index + 1;
    if (item.description.trim().length === 0) errors.push(`Line ${line} needs a description.`);
    if (!Number.isInteger(item.quantity) || item.quantity < 1) errors.push(`Line ${line} needs a quantity of at least 1.`);
    if (!Number.isInteger(item.unitPriceCents) || item.unitPriceCents < 0) {
      errors.push(`Line ${line} needs a valid price.`);
    }
  });
  if (items.length > 0 && invoiceTotalCents(items) <= 0) errors.push('The invoice total must be greater than zero.');
  return errors;
}
