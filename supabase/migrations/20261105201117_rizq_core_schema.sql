/*
# Rizq AI Payments core schema

1. Plain-English summary
Creates the data model for the invoicing and payment platform: businesses, customers, invoices with line items, PayPal transaction records, AI generation history, and an audit trail. Every row belongs to the signed-in user who created it, and users can only ever see their own data.

2. New tables
- businesses: one profile per user (name, contact details, default currency).
- customers: people or companies the user bills.
- invoices: invoice header with status (draft, open, paid, cancelled), totals, due date, a private public_token used by the customer payment link, and PayPal order reference.
- invoice_items: itemized lines of an invoice (description, quantity, unit price in cents).
- transactions: payment attempts and outcomes recorded from PayPal. Written only by the server.
- ai_generations: history of AI outputs produced for the user. Written only by the server.
- audit_logs: record of sensitive actions such as payment creation and capture. Written only by the server.

3. Security
- Row level security is enabled on every table.
- Signed-in users get owner-scoped policies (auth.uid() checks).
- Invoices can only be created as drafts by the owner. Payment fields (paid_at, paypal_order_id) and the invoice status "paid" can only be set by the server using the service role.
- Invoice items can only be changed while the parent invoice is a draft.
- Transactions, AI generations and audit logs are read-only for owners.
- Column-level grants keep payment columns out of owner write access.

4. Notes
- Amounts are stored as integer cents to avoid rounding errors.
- Trigger functions are not callable by API roles.
*/

CREATE TABLE IF NOT EXISTS businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  email text,
  phone text,
  address text,
  currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  email text,
  phone text,
  company text,
  address text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES customers(id) ON DELETE SET NULL,
  invoice_number text NOT NULL UNIQUE DEFAULT ('INV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  title text NOT NULL DEFAULT 'Invoice' CHECK (char_length(title) BETWEEN 1 AND 160),
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'paid', 'cancelled')),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  total_cents integer NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  due_date date,
  notes text,
  ai_payment_message text,
  ai_explanation text,
  ai_layout text,
  public_token text NOT NULL UNIQUE DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  paypal_order_id text UNIQUE,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 300),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 100000),
  unit_price_cents integer NOT NULL CHECK (unit_price_cents >= 0 AND unit_price_cents <= 100000000),
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  paypal_order_id text NOT NULL UNIQUE,
  paypal_capture_id text UNIQUE,
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'capturing', 'completed', 'pending', 'declined', 'failed', 'cancelled')),
  payer_name text,
  payer_email text,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES invoices(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('invoice_draft', 'business_assistant')),
  prompt text NOT NULL,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_user ON customers(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user_status ON invoices(user_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_created ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_invoice ON transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_ai_generations_user ON ai_generations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION set_updated_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_businesses_updated ON businesses;
CREATE TRIGGER trg_businesses_updated BEFORE UPDATE ON businesses FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_customers_updated ON customers;
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_invoices_updated ON invoices;
CREATE TRIGGER trg_invoices_updated BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_invoice_items_updated ON invoice_items;
CREATE TRIGGER trg_invoice_items_updated BEFORE UPDATE ON invoice_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS trg_transactions_updated ON transactions;
CREATE TRIGGER trg_transactions_updated BEFORE UPDATE ON transactions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- businesses
GRANT SELECT, INSERT ON businesses TO authenticated;
GRANT UPDATE (name, email, phone, address, currency) ON businesses TO authenticated;
GRANT ALL ON businesses TO service_role;

DROP POLICY IF EXISTS "select_own_business" ON businesses;
CREATE POLICY "select_own_business" ON businesses FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_business" ON businesses;
CREATE POLICY "insert_own_business" ON businesses FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_business" ON businesses;
CREATE POLICY "update_own_business" ON businesses FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- customers
GRANT SELECT, INSERT, UPDATE, DELETE ON customers TO authenticated;
GRANT ALL ON customers TO service_role;

DROP POLICY IF EXISTS "select_own_customers" ON customers;
CREATE POLICY "select_own_customers" ON customers FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_customers" ON customers;
CREATE POLICY "insert_own_customers" ON customers FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "update_own_customers" ON customers;
CREATE POLICY "update_own_customers" ON customers FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "delete_own_customers" ON customers;
CREATE POLICY "delete_own_customers" ON customers FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- invoices: owners create drafts, edit drafts and open invoices, and can never set paid or payment fields
GRANT SELECT ON invoices TO authenticated;
GRANT INSERT (user_id, customer_id, title, description, status, currency, total_cents, due_date, notes, ai_payment_message, ai_explanation, ai_layout) ON invoices TO authenticated;
GRANT UPDATE (customer_id, title, description, status, currency, total_cents, due_date, notes, ai_payment_message, ai_explanation, ai_layout) ON invoices TO authenticated;
GRANT DELETE ON invoices TO authenticated;
GRANT ALL ON invoices TO service_role;

DROP POLICY IF EXISTS "select_own_invoices" ON invoices;
CREATE POLICY "select_own_invoices" ON invoices FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_draft_invoices" ON invoices;
CREATE POLICY "insert_own_draft_invoices" ON invoices FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'draft');
DROP POLICY IF EXISTS "update_own_draft_invoices" ON invoices;
CREATE POLICY "update_own_draft_invoices" ON invoices FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND status = 'draft')
  WITH CHECK (auth.uid() = user_id AND status IN ('draft', 'open', 'cancelled'));
DROP POLICY IF EXISTS "update_own_open_invoices" ON invoices;
CREATE POLICY "update_own_open_invoices" ON invoices FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND status = 'open')
  WITH CHECK (auth.uid() = user_id AND status IN ('open', 'cancelled'));
DROP POLICY IF EXISTS "delete_own_draft_invoices" ON invoices;
CREATE POLICY "delete_own_draft_invoices" ON invoices FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND status = 'draft');

-- invoice items: editable only while the parent invoice is a draft
GRANT SELECT ON invoice_items TO authenticated;
GRANT INSERT (invoice_id, user_id, description, quantity, unit_price_cents, position) ON invoice_items TO authenticated;
GRANT UPDATE (description, quantity, unit_price_cents, position) ON invoice_items TO authenticated;
GRANT DELETE ON invoice_items TO authenticated;
GRANT ALL ON invoice_items TO service_role;

DROP POLICY IF EXISTS "select_own_invoice_items" ON invoice_items;
CREATE POLICY "select_own_invoice_items" ON invoice_items FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "insert_own_draft_items" ON invoice_items;
CREATE POLICY "insert_own_draft_items" ON invoice_items FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id AND EXISTS (
      SELECT 1 FROM invoices WHERE invoices.id = invoice_items.invoice_id AND invoices.user_id = auth.uid() AND invoices.status = 'draft'
    )
  );
DROP POLICY IF EXISTS "update_own_draft_items" ON invoice_items;
CREATE POLICY "update_own_draft_items" ON invoice_items FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id AND EXISTS (
      SELECT 1 FROM invoices WHERE invoices.id = invoice_items.invoice_id AND invoices.user_id = auth.uid() AND invoices.status = 'draft'
    )
  )
  WITH CHECK (
    auth.uid() = user_id AND EXISTS (
      SELECT 1 FROM invoices WHERE invoices.id = invoice_items.invoice_id AND invoices.user_id = auth.uid() AND invoices.status = 'draft'
    )
  );
DROP POLICY IF EXISTS "delete_own_draft_items" ON invoice_items;
CREATE POLICY "delete_own_draft_items" ON invoice_items FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id AND EXISTS (
      SELECT 1 FROM invoices WHERE invoices.id = invoice_items.invoice_id AND invoices.user_id = auth.uid() AND invoices.status = 'draft'
    )
  );

-- read-only records for owners; written by the server only
GRANT SELECT ON transactions TO authenticated;
GRANT ALL ON transactions TO service_role;
DROP POLICY IF EXISTS "select_own_transactions" ON transactions;
CREATE POLICY "select_own_transactions" ON transactions FOR SELECT TO authenticated USING (auth.uid() = user_id);

GRANT SELECT ON ai_generations TO authenticated;
GRANT ALL ON ai_generations TO service_role;
DROP POLICY IF EXISTS "select_own_ai_generations" ON ai_generations;
CREATE POLICY "select_own_ai_generations" ON ai_generations FOR SELECT TO authenticated USING (auth.uid() = user_id);

GRANT SELECT ON audit_logs TO authenticated;
GRANT ALL ON audit_logs TO service_role;
DROP POLICY IF EXISTS "select_own_audit_logs" ON audit_logs;
CREATE POLICY "select_own_audit_logs" ON audit_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
