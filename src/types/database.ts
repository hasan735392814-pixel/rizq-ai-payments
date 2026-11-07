export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'cancelled';
export type TransactionStatus = 'created' | 'capturing' | 'completed' | 'pending' | 'declined' | 'failed' | 'cancelled';
export type Currency = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD';

export interface Business {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  currency: string;
  created_at: string;
}

export interface Customer {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
}

export interface Invoice {
  id: string;
  user_id: string;
  customer_id: string | null;
  invoice_number: string;
  title: string;
  description: string | null;
  status: InvoiceStatus;
  currency: Currency;
  total_cents: number;
  due_date: string | null;
  notes: string | null;
  ai_payment_message: string | null;
  ai_explanation: string | null;
  ai_layout: string | null;
  public_token: string;
  paypal_order_id: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceWithCustomer extends Invoice {
  customers: { name: string } | null;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  position: number;
}

export interface Transaction {
  id: string;
  user_id: string;
  invoice_id: string | null;
  paypal_order_id: string;
  paypal_capture_id: string | null;
  amount_cents: number;
  currency: string;
  status: TransactionStatus;
  payer_name: string | null;
  payer_email: string | null;
  failure_reason: string | null;
  created_at: string;
}

export interface AuditLog {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface PublicInvoice {
  invoice: {
    invoiceNumber: string;
    title: string;
    description: string | null;
    status: InvoiceStatus;
    currency: Currency;
    dueDate: string | null;
    paidAt: string | null;
    createdAt: string;
    totalCents: number;
  };
  business: { name: string; email: string | null; phone: string | null; address: string | null } | null;
  customer: { name: string; email: string | null; company: string | null; address: string | null } | null;
  items: { description: string; quantity: number; unitPriceCents: number }[];
}

export interface PayPalStatus {
  configured: boolean;
  authenticated: boolean;
  environment: 'sandbox' | 'live';
  clientId: string | null;
  checkedAt: string;
}
