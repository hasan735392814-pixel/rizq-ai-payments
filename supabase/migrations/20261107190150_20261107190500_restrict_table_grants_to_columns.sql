/*
# Restrict client table grants to the intended columns

1. Plain-English summary
Removes the broad table-wide privileges that the platform gave the browser-facing roles on the Rizq tables, then re-grants only the column-level and verb-level access the app actually needs. Payment fields such as paid_at and paypal_order_id can no longer be written by a signed-in owner.

2. Modified privileges
- businesses, customers, invoices, invoice_items, transactions, ai_generations, audit_logs: all table-wide privileges revoked from anon and authenticated.
- Re-granted to authenticated only, matching the original core schema intent:
  - businesses: SELECT, INSERT; UPDATE on name, email, phone, address, currency.
  - customers: SELECT, INSERT, UPDATE, DELETE.
  - invoices: SELECT; INSERT and UPDATE on the owner-editable columns only; DELETE.
  - invoice_items: SELECT; INSERT and UPDATE on the item columns only; DELETE.
  - transactions, ai_generations, audit_logs: SELECT only.
- anon has no privileges on these tables. Row level security policies are unchanged.
- service_role grants are unchanged.

3. Security notes
- Owners can no longer set paid_at or paypal_order_id directly.
- The server-side payment functions use the service role and are not affected.
- Row level security policies continue to scope every row to its owner.
*/

REVOKE ALL ON businesses, customers, invoices, invoice_items, transactions, ai_generations, audit_logs FROM anon, authenticated;

GRANT SELECT, INSERT ON businesses TO authenticated;
GRANT UPDATE (name, email, phone, address, currency) ON businesses TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON customers TO authenticated;

GRANT SELECT ON invoices TO authenticated;
GRANT INSERT (user_id, customer_id, title, description, status, currency, total_cents, due_date, notes, ai_payment_message, ai_explanation, ai_layout) ON invoices TO authenticated;
GRANT UPDATE (customer_id, title, description, status, currency, total_cents, due_date, notes, ai_payment_message, ai_explanation, ai_layout) ON invoices TO authenticated;
GRANT DELETE ON invoices TO authenticated;

GRANT SELECT ON invoice_items TO authenticated;
GRANT INSERT (invoice_id, user_id, description, quantity, unit_price_cents, position) ON invoice_items TO authenticated;
GRANT UPDATE (description, quantity, unit_price_cents, position) ON invoice_items TO authenticated;
GRANT DELETE ON invoice_items TO authenticated;

GRANT SELECT ON transactions TO authenticated;
GRANT SELECT ON ai_generations TO authenticated;
GRANT SELECT ON audit_logs TO authenticated;
