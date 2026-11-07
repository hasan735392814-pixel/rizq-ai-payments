# Rizq AI Payments

AI-powered invoicing with PayPal Sandbox payments and a Gemini business assistant, built for the PayPal AI Hackathon 2026.

Create invoices, let Gemini write the wording, confirm the draft to lock the amounts, share a payment link, and the customer pays through PayPal Sandbox. The server verifies every capture before marking an invoice paid.

## What's inside

- **Invoicing** — drafts, line items, status transitions (draft → open → paid / cancelled), public payment links, audit history.
- **PayPal Sandbox checkout** — Orders v2 lifecycle (create → approve → capture → verify) handled by a Supabase Edge Function. Amounts are recomputed on the server from line items; `paid` is set only after a `COMPLETED` capture whose amount, currency, and invoice id all match.
- **Gemini AI** — an Edge Function writes invoice wording (title, description, payment message) and answers a business-assistant chat using the seller's own invoices and transactions as facts.
- **Analytics** — verified revenue from completed captures, monthly invoiced-vs-paid chart, outstanding balances, collection rate, top customers. Actual figures are clearly separated from estimates.
- **Auth** — Supabase email/password. Every table is owner-scoped with row-level security.

## Tech stack

React 18 + TypeScript + Vite, Tailwind CSS, react-router-dom, lucide-react, @supabase/supabase-js. Backend: Supabase Postgres, RLS, and Deno Edge Functions.

## Getting started

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env` and fill in the values (Supabase, Gemini, PayPal Sandbox).
3. Run the dev server: `npm run dev`

The Supabase project, schema migration, and both Edge Functions (`paypal`, `ai`) are already deployed in this project.

## Environment variables

See [`.env.example`](.env.example) for the full list and placeholders. Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` reach the browser. PayPal and Gemini secrets stay server-side and are never exposed to the client.

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run typecheck` | TypeScript type check |
| `npm run lint` | ESLint |
| `npx vitest run` | Run unit tests |

## How payments stay safe

- The browser never sets an invoice to `paid`. RLS grants only allow `draft`, `open`, and `cancelled` from the client; `paid` and `paid_at` are server-only columns.
- The PayPal Edge Function recomputes the total from `invoice_items` in integer cents and rejects captures whose amount, currency, or `custom_id` don't match.
- A transaction is claimed with a status update (`created` → `capturing`) before capture, so two simultaneous approvals can't double-capture.
- `PayPal-Request-Id` headers make order creation and capture idempotent.

## Testing a payment (Sandbox)

1. Open **PayPal connection** in the app and confirm the status is connected.
2. Create an invoice, add line items, and **Confirm invoice** to open it.
3. Copy the payment link and open it in a private window.
4. Pay with a Sandbox buyer account from developer.paypal.com.
5. The invoice switches to **Paid** once the server verifies the capture. No real money moves.

## License

MIT — see [LICENSE](LICENSE).
