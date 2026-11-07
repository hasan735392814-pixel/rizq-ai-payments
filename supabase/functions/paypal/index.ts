import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.57.4";
import { z } from "npm:zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
const orderIdSchema = z.string().regex(/^[A-Z0-9]{8,40}$/);
const createOrderBody = z.object({ token: tokenSchema });
const captureBody = z.object({ token: tokenSchema, orderId: orderIdSchema });

const createdOrderResponse = z.object({ id: z.string(), status: z.string() });

const orderResponse = z.object({
  id: z.string(),
  status: z.string(),
  payer: z
    .object({
      email_address: z.string().optional(),
      name: z
        .object({ given_name: z.string().optional(), surname: z.string().optional() })
        .optional(),
    })
    .optional(),
  purchase_units: z
    .array(
      z.object({
        custom_id: z.string().optional(),
        payments: z
          .object({
            captures: z
              .array(
                z.object({
                  id: z.string(),
                  status: z.string(),
                  amount: z.object({ currency_code: z.string(), value: z.string() }),
                })
              )
              .optional(),
          })
          .optional(),
      })
    )
    .min(1),
});

const paypalErrorResponse = z
  .object({ details: z.array(z.object({ issue: z.string() })).optional() })
  .passthrough();

type Order = z.infer<typeof orderResponse>;

interface InvoiceRow {
  id: string;
  user_id: string;
  status: string;
  currency: string;
  title: string;
  invoice_number: string;
  public_token: string;
}

interface TransactionRow {
  id: string;
  invoice_id: string | null;
  paypal_order_id: string;
  status: string;
  amount_cents: number;
  currency: string;
}

interface PayableItem {
  description: string;
  quantity: number;
  unit_price_cents: number;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function ownerIdFromRequest(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

function paypalBaseUrl(): string {
  return (Deno.env.get("PAYPAL_BASE_URL") ?? "https://api-m.sandbox.paypal.com").replace(/\/$/, "");
}

function paypalEnvironment(): "sandbox" | "live" {
  return paypalBaseUrl().includes("sandbox") ? "sandbox" : "live";
}

async function paypalToken(): Promise<string> {
  const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
  const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new HttpError(503, "PayPal is not configured yet. The PayPal Sandbox credentials are missing.");
  }
  let res: Response;
  try {
    res = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
  } catch {
    throw new HttpError(502, "Could not reach PayPal. Please try again.");
  }
  const data: unknown = await res.json().catch(() => null);
  const token = z.object({ access_token: z.string() }).safeParse(data);
  if (!res.ok || !token.success) throw new HttpError(502, "Could not authenticate with PayPal.");
  return token.data.access_token;
}

interface PaypalResponse {
  ok: boolean;
  status: number;
  data: unknown;
}

async function paypalRequest(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  requestId?: string
): Promise<PaypalResponse> {
  const accessToken = await paypalToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
  if (requestId) headers["PayPal-Request-Id"] = requestId;
  let res: Response;
  try {
    res = await fetch(`${paypalBaseUrl()}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new HttpError(502, "Could not reach PayPal. Please try again.");
  }
  const data: unknown = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function formatAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

function truncate(value: string, max: number): string {
  return value.length > max ? value.slice(0, max - 1) + "…" : value;
}

async function audit(
  admin: SupabaseClient,
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata: Record<string, unknown>
) {
  const { error } = await admin.from("audit_logs").insert({
    user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    metadata,
  });
  if (error) console.error("audit log write failed", action);
}

async function invoiceByToken(admin: SupabaseClient, token: string): Promise<InvoiceRow> {
  const { data, error } = await admin
    .from("invoices")
    .select("id, user_id, status, currency, title, invoice_number, public_token")
    .eq("public_token", token)
    .maybeSingle();
  if (error) throw new Error("invoice lookup failed");
  if (!data || data.status === "draft") throw new HttpError(404, "Invoice not found.");
  return data as InvoiceRow;
}

async function payableItems(admin: SupabaseClient, invoiceId: string): Promise<PayableItem[]> {
  const { data, error } = await admin
    .from("invoice_items")
    .select("description, quantity, unit_price_cents")
    .eq("invoice_id", invoiceId)
    .order("position", { ascending: true });
  if (error) throw new Error("item lookup failed");
  if (!data || data.length === 0) throw new HttpError(422, "This invoice has no line items to pay.");
  return data as PayableItem[];
}

function sumCents(items: PayableItem[]): number {
  return items.reduce((total, item) => total + item.quantity * item.unit_price_cents, 0);
}

async function transactionForOrder(
  admin: SupabaseClient,
  invoiceId: string,
  orderId: string
): Promise<TransactionRow> {
  const { data, error } = await admin
    .from("transactions")
    .select("id, invoice_id, paypal_order_id, status, amount_cents, currency")
    .eq("invoice_id", invoiceId)
    .eq("paypal_order_id", orderId)
    .maybeSingle();
  if (error) throw new Error("transaction lookup failed");
  if (!data) throw new HttpError(404, "Payment not found for this invoice.");
  return data as TransactionRow;
}

async function settleOrder(
  admin: SupabaseClient,
  txn: TransactionRow,
  invoice: InvoiceRow,
  order: Order,
  expectedCents: number
): Promise<string> {
  const unit = order.purchase_units[0];
  const capture = unit.payments?.captures?.[0];
  if (!capture) return txn.status;

  const payer = order.payer;
  const payerName = [payer?.name?.given_name, payer?.name?.surname].filter(Boolean).join(" ") || null;
  const amountMatches =
    unit.custom_id === invoice.id &&
    capture.amount.currency_code === txn.currency &&
    capture.amount.value === formatAmount(txn.amount_cents) &&
    txn.amount_cents === expectedCents;

  let status: string;
  let failureReason: string | null = null;
  if (capture.status === "COMPLETED" && amountMatches) {
    status = "completed";
  } else if (capture.status === "COMPLETED") {
    status = "failed";
    failureReason = "The captured amount did not match the invoice. The payment was flagged for review.";
  } else if (capture.status === "PENDING") {
    status = "pending";
  } else if (capture.status === "DECLINED") {
    status = "declined";
    failureReason = "The payment was declined.";
  } else {
    status = "failed";
    failureReason = `PayPal reported this payment as ${capture.status.toLowerCase()}.`;
  }

  const { error } = await admin
    .from("transactions")
    .update({
      status,
      paypal_capture_id: capture.id,
      payer_name: payerName,
      payer_email: payer?.email_address ?? null,
      failure_reason: failureReason,
    })
    .eq("id", txn.id);
  if (error) throw new Error("transaction update failed");

  if (status === "completed") {
    const { error: invoiceError } = await admin
      .from("invoices")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", invoice.id)
      .neq("status", "paid");
    if (invoiceError) throw new Error("invoice update failed");
  }

  await audit(admin, invoice.user_id, `payment.${status}`, "transaction", txn.id, {
    orderId: txn.paypal_order_id,
    invoiceId: invoice.id,
    amountCents: txn.amount_cents,
    currency: txn.currency,
    failureReason,
  });
  return status;
}

async function syncTransaction(
  admin: SupabaseClient,
  txn: TransactionRow,
  invoice: InvoiceRow,
  expectedCents: number
): Promise<string> {
  const res = await paypalRequest("GET", `/v2/checkout/orders/${txn.paypal_order_id}`);
  if (!res.ok) throw new HttpError(502, "Could not check the PayPal payment status.");
  const order = orderResponse.parse(res.data);
  if (txn.status === "completed") return txn.status;
  if (!order.purchase_units[0].payments?.captures?.length) return txn.status;
  return settleOrder(admin, txn, invoice, order, expectedCents);
}

async function publicInvoice(url: URL) {
  const token = tokenSchema.parse(url.searchParams.get("token") ?? "");
  const admin = adminClient();
  const { data: invoice, error } = await admin
    .from("invoices")
    .select("id, user_id, customer_id, invoice_number, title, description, status, currency, due_date, paid_at, created_at")
    .eq("public_token", token)
    .maybeSingle();
  if (error) throw new Error("invoice lookup failed");
  if (!invoice || invoice.status === "draft") throw new HttpError(404, "Invoice not found.");

  const [businessRes, customerRes, itemsRes] = await Promise.all([
    admin.from("businesses").select("name, email, phone, address").eq("user_id", invoice.user_id).maybeSingle(),
    invoice.customer_id
      ? admin.from("customers").select("name, email, company, address").eq("id", invoice.customer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    admin
      .from("invoice_items")
      .select("description, quantity, unit_price_cents")
      .eq("invoice_id", invoice.id)
      .order("position", { ascending: true }),
  ]);
  if (businessRes.error || customerRes.error || itemsRes.error) throw new Error("public invoice lookup failed");

  const items = (itemsRes.data ?? []) as PayableItem[];
  return json({
    invoice: {
      invoiceNumber: invoice.invoice_number,
      title: invoice.title,
      description: invoice.description,
      status: invoice.status,
      currency: invoice.currency,
      dueDate: invoice.due_date,
      paidAt: invoice.paid_at,
      createdAt: invoice.created_at,
      totalCents: sumCents(items),
    },
    business: businessRes.data,
    customer: customerRes.data,
    items: items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPriceCents: item.unit_price_cents,
    })),
  });
}

async function createOrder(req: Request) {
  const { token } = createOrderBody.parse(await req.json());
  const admin = adminClient();
  const invoice = await invoiceByToken(admin, token);
  if (invoice.status !== "open") throw new HttpError(409, "This invoice is not open for payment.");

  const items = await payableItems(admin, invoice.id);
  const totalCents = sumCents(items);
  if (totalCents <= 0) throw new HttpError(422, "This invoice total must be greater than zero.");

  const currency = invoice.currency;
  const value = formatAmount(totalCents);
  const created = await paypalRequest(
    "POST",
    "/v2/checkout/orders",
    {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: invoice.invoice_number,
          custom_id: invoice.id,
          description: truncate(invoice.title, 127),
          amount: {
            currency_code: currency,
            value,
            breakdown: { item_total: { currency_code: currency, value } },
          },
          items: items.map((item) => ({
            name: truncate(item.description, 127),
            quantity: String(item.quantity),
            unit_amount: { currency_code: currency, value: formatAmount(item.unit_price_cents) },
          })),
        },
      ],
    },
    crypto.randomUUID()
  );
  if (!created.ok) throw new HttpError(502, "PayPal could not create this payment. Please try again.");
  const order = createdOrderResponse.parse(created.data);

  const { error: txError } = await admin.from("transactions").insert({
    user_id: invoice.user_id,
    invoice_id: invoice.id,
    paypal_order_id: order.id,
    amount_cents: totalCents,
    currency,
    status: "created",
  });
  if (txError) throw new Error("transaction insert failed");

  await admin.from("invoices").update({ paypal_order_id: order.id }).eq("id", invoice.id);
  await audit(admin, invoice.user_id, "payment.order_created", "invoice", invoice.id, {
    orderId: order.id,
    amountCents: totalCents,
    currency,
  });
  return json({ orderId: order.id, status: order.status });
}

async function captureOrder(req: Request) {
  const { token, orderId } = captureBody.parse(await req.json());
  const admin = adminClient();
  const invoice = await invoiceByToken(admin, token);
  const txn = await transactionForOrder(admin, invoice.id, orderId);

  if (txn.status === "completed") return json({ status: "completed" });
  if (invoice.status !== "open") throw new HttpError(409, "This invoice is no longer open for payment.");
  if (txn.status !== "created") return json({ status: txn.status });

  const { data: claimed, error: claimError } = await admin
    .from("transactions")
    .update({ status: "capturing" })
    .eq("id", txn.id)
    .eq("status", "created")
    .select("id")
    .maybeSingle();
  if (claimError) throw new Error("transaction claim failed");
  if (!claimed) return json({ status: "processing" }, 202);

  const expectedCents = sumCents(await payableItems(admin, invoice.id));
  const release = () => admin.from("transactions").update({ status: "created" }).eq("id", txn.id);

  let res: PaypalResponse;
  try {
    res = await paypalRequest("POST", `/v2/checkout/orders/${orderId}/capture`, {}, crypto.randomUUID());
  } catch (err) {
    await release();
    throw err;
  }

  if (res.ok) {
    const order = orderResponse.parse(res.data);
    const status = await settleOrder(admin, txn, invoice, order, expectedCents);
    return json({ status });
  }

  const issue = paypalErrorResponse.safeParse(res.data);
  const issueCode = issue.success ? issue.data.details?.[0]?.issue : undefined;

  if (issueCode === "INSTRUMENT_DECLINED") {
    await release();
    return json({
      status: "declined",
      retryable: true,
      message: "This payment method was declined. Please choose another payment method.",
    });
  }
  if (issueCode === "ORDER_ALREADY_CAPTURED") {
    const status = await syncTransaction(admin, { ...txn, status: "capturing" }, invoice, expectedCents);
    return json({ status });
  }
  if (res.status >= 500 || res.status === 429) {
    await release();
    throw new HttpError(502, "PayPal is temporarily unavailable. Please try again.");
  }

  await admin
    .from("transactions")
    .update({ status: "failed", failure_reason: "PayPal could not capture this payment." })
    .eq("id", txn.id);
  await audit(admin, invoice.user_id, "payment.failed", "transaction", txn.id, {
    orderId,
    httpStatus: res.status,
    issue: issueCode ?? null,
  });
  return json({ status: "failed", message: "PayPal could not capture this payment." });
}

async function orderStatus(req: Request, orderId: string, url: URL) {
  const admin = adminClient();
  const { data: txnRow, error } = await admin
    .from("transactions")
    .select("id, invoice_id, paypal_order_id, status, amount_cents, currency")
    .eq("paypal_order_id", orderId)
    .maybeSingle();
  if (error) throw new Error("transaction lookup failed");
  if (!txnRow || !txnRow.invoice_id) throw new HttpError(404, "Payment not found.");

  const { data: invoiceRow, error: invoiceError } = await admin
    .from("invoices")
    .select("id, user_id, status, currency, title, invoice_number, public_token")
    .eq("id", txnRow.invoice_id)
    .maybeSingle();
  if (invoiceError || !invoiceRow) throw new HttpError(404, "Payment not found.");
  const invoice = invoiceRow as InvoiceRow;

  const token = url.searchParams.get("token");
  const ownerId = await ownerIdFromRequest(req);
  const allowed = (token !== null && token === invoice.public_token) || (ownerId !== null && ownerId === invoice.user_id);
  if (!allowed) throw new HttpError(404, "Payment not found.");

  const expectedCents = sumCents(await payableItems(admin, invoice.id));
  const status = await syncTransaction(admin, txnRow as TransactionRow, invoice, expectedCents);
  return json({ orderId, status });
}

async function paypalStatus() {
  const clientId = Deno.env.get("PAYPAL_CLIENT_ID") ?? "";
  const configured = clientId.length > 0 && Boolean(Deno.env.get("PAYPAL_CLIENT_SECRET"));
  let authenticated = false;
  if (configured) {
    authenticated = await paypalToken().then(
      () => true,
      () => false
    );
  }
  return json({
    configured,
    authenticated,
    environment: paypalEnvironment(),
    clientId: configured ? clientId : null,
    checkedAt: new Date().toISOString(),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const route = url.pathname.replace(/^.*\/paypal/, "").replace(/\/$/, "");

    if (req.method === "POST" && route === "/create-order") return await createOrder(req);
    if (req.method === "POST" && route === "/capture-order") return await captureOrder(req);
    if (req.method === "GET" && route.startsWith("/order/")) {
      return await orderStatus(req, route.slice("/order/".length), url);
    }
    if (req.method === "GET" && route === "/invoice") return await publicInvoice(url);
    if (req.method === "GET" && route === "/status") return await paypalStatus();

    return json({ error: "Not found." }, 404);
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    if (err instanceof z.ZodError) return json({ error: "The request is invalid." }, 400);
    console.error("paypal function failed", err instanceof Error ? err.message : "unknown error");
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
