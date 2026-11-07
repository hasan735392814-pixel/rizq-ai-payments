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

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD"] as const;

const invoiceDraftBody = z.object({
  customerName: z.string().trim().min(1).max(120),
  product: z.string().trim().min(1).max(200),
  unitPrice: z.number().min(0).max(1000000),
  quantity: z.number().int().min(1).max(100000),
  currency: z.enum(CURRENCIES),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  instructions: z.string().trim().max(500).optional().nullable(),
});

const assistantBody = z.object({
  question: z.string().trim().min(1).max(500),
});

const draftOutput = z.object({
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(600),
  layout: z.string().min(1).max(400),
  paymentMessage: z.string().min(1).max(800),
  explanation: z.string().min(1).max(800),
});

const assistantOutput = z.object({
  answer: z.string().min(1).max(3000),
});

const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-2.5-flash";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function userClient(authHeader: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function requireUser(req: Request, client: SupabaseClient): Promise<string> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new HttpError(401, "Please sign in to use the AI assistant.");
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new HttpError(401, "Your session has expired. Please sign in again.");
  return data.user.id;
}

const geminiSchemaDraft = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    description: { type: "STRING" },
    layout: { type: "STRING" },
    paymentMessage: { type: "STRING" },
    explanation: { type: "STRING" },
  },
  required: ["title", "description", "layout", "paymentMessage", "explanation"],
};

const geminiSchemaAssistant = {
  type: "OBJECT",
  properties: { answer: { type: "STRING" } },
  required: ["answer"],
};

async function callGemini(prompt: string, schema: Record<string, unknown>): Promise<string> {
  return callGeminiInner(prompt, schema, 2);
}

async function callGeminiInner(prompt: string, schema: Record<string, unknown>, attemptsLeft: number): Promise<string> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) {
    throw new HttpError(503, "The AI assistant is not configured yet. The Gemini API key is missing. You can still create invoices manually.");
  }
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: schema,
          temperature: 0.4,
        },
      }),
    });
  } catch {
    throw new HttpError(502, "The AI service could not be reached. Please try again.");
  }
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.error("gemini api error", res.status, errBody.slice(0, 500));

    // 503 = transient capacity issue on Google's side — retry with backoff
    if (res.status === 503 && attemptsLeft > 0) {
      await new Promise((r) => setTimeout(r, 1500));
      return callGeminiInner(prompt, schema, attemptsLeft - 1);
    }

    // 429 = either a short rate-limit or daily quota exhaustion
    // Only retry if it looks like a temporary rate limit (RESOURCE_EXHAUSTED per-minute)
    // Quota-exceeded (daily) errors are permanent until reset — do not retry
    const isQuotaExceeded = errBody.includes("quota") || errBody.includes("billing");
    if (res.status === 429 && attemptsLeft > 0 && !isQuotaExceeded) {
      await new Promise((r) => setTimeout(r, 2000));
      return callGeminiInner(prompt, schema, attemptsLeft - 1);
    }
    if (res.status === 429 && isQuotaExceeded) {
      throw new HttpError(503, "The AI assistant has reached its daily usage limit. You can still create invoices manually — the AI will be available again tomorrow.");
    }

    throw new HttpError(502, "The AI service could not respond. Please try again.");
  }
  const payload: unknown = await res.json().catch(() => null);
  const text = z
    .object({
      candidates: z
        .array(z.object({ content: z.object({ parts: z.array(z.object({ text: z.string() })) }) }))
        .min(1),
    })
    .safeParse(payload);
  if (!text.success) throw new HttpError(502, "The AI service returned an unexpected response.");
  return text.data.candidates[0].content.parts.map((part) => part.text).join("");
}

function parseModelJson<T>(raw: string, schema: z.ZodType<T>): T {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError(502, "The AI service returned an unreadable response. Please try again.");
  }
  const result = schema.safeParse(parsed);
  if (!result.success) throw new HttpError(502, "The AI service returned an unexpected response. Please try again.");
  return result.data;
}

function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

async function invoiceDraft(req: Request, client: SupabaseClient, admin: SupabaseClient, userId: string) {
  const body = invoiceDraftBody.parse(await req.json());
  const { data: business } = await client.from("businesses").select("name").eq("user_id", userId).maybeSingle();

  const prompt = [
    "You help a small business write its invoice wording. Write in clear, professional, plain English.",
    "Do NOT state, calculate, or change any amount, price, quantity, or total. Amounts are handled by the system.",
    "Return JSON with: title (short professional invoice title), description (a clear service description of 1-3 sentences),",
    "layout (a short suggestion for how to lay out the invoice), paymentMessage (a polite message asking the customer to pay, without amounts),",
    "and explanation (the invoice explained in simple language for the business owner, without amounts).",
    "",
    `Business name: ${business?.name ?? "Not provided"}`,
    `Customer name: ${body.customerName}`,
    `Product or service: ${body.product}`,
    `Due date: ${body.dueDate ?? "Not set"}`,
    `Additional instructions from the business owner: ${body.instructions?.trim() || "None"}`,
  ].join("\n");

  const raw = await callGemini(prompt, geminiSchemaDraft);
  const draft = parseModelJson(raw, draftOutput);

  await admin.from("ai_generations").insert({
    user_id: userId,
    kind: "invoice_draft",
    prompt: `Invoice wording for ${body.product} (${body.customerName})`,
    result: draft,
    model: GEMINI_MODEL,
  });

  return json({ ...draft, model: GEMINI_MODEL });
}

interface AssistantFacts {
  businessName: string | null;
  currencies: Record<string, { paidTotal: string; outstandingTotal: string; overdueTotal: string }>;
  invoiceCounts: { draft: number; open: number; paid: number; cancelled: number };
  overdueInvoices: { invoiceNumber: string; customer: string | null; amount: string; dueDate: string }[];
  unpaidInvoices: { invoiceNumber: string; customer: string | null; amount: string; dueDate: string | null; status: string }[];
  customerOutstanding: { customer: string; outstanding: string }[];
  recentTransactions: { date: string; customer: string | null; amount: string; status: string }[];
  customerCount: number;
}

async function buildFacts(client: SupabaseClient, userId: string): Promise<AssistantFacts> {
  const [businessRes, invoicesRes, transactionsRes, customersRes, customerNamesRes] = await Promise.all([
    client.from("businesses").select("name").eq("user_id", userId).maybeSingle(),
    client
      .from("invoices")
      .select("invoice_number, customer_id, status, currency, total_cents, due_date, paid_at")
      .order("created_at", { ascending: false })
      .limit(500),
    client
      .from("transactions")
      .select("amount_cents, currency, status, created_at, invoice_id, payer_name")
      .order("created_at", { ascending: false })
      .limit(20),
    client.from("customers").select("id", { count: "exact", head: true }),
    client.from("customers").select("id, name"),
  ]);
  if (businessRes.error || invoicesRes.error || transactionsRes.error || customersRes.error || customerNamesRes.error) {
    throw new Error("assistant data lookup failed");
  }

  const names = new Map((customerNamesRes.data ?? []).map((c) => [c.id, c.name as string]));
  const today = new Date().toISOString().slice(0, 10);
  const invoices = invoicesRes.data ?? [];

  const facts: AssistantFacts = {
    businessName: businessRes.data?.name ?? null,
    currencies: {},
    invoiceCounts: { draft: 0, open: 0, paid: 0, cancelled: 0 },
    overdueInvoices: [],
    unpaidInvoices: [],
    customerOutstanding: [],
    recentTransactions: [],
    customerCount: customersRes.count ?? 0,
  };
  const totalsByCurrency = new Map<string, { paid: number; outstanding: number; overdue: number }>();
  const outstandingByCustomer = new Map<string, Map<string, number>>();

  for (const invoice of invoices) {
    const cur = invoice.currency as string;
    const cents = invoice.total_cents as number;
    const totals = totalsByCurrency.get(cur) ?? { paid: 0, outstanding: 0, overdue: 0 };
    totalsByCurrency.set(cur, totals);
    const status = invoice.status as keyof AssistantFacts["invoiceCounts"];
    facts.invoiceCounts[status] = (facts.invoiceCounts[status] ?? 0) + 1;
    const customer = invoice.customer_id ? names.get(invoice.customer_id) ?? null : null;
    const amount = formatMoney(cents, cur);

    if (status === "paid") totals.paid += cents;
    if (status !== "open") continue;

    const isOverdue = Boolean(invoice.due_date && invoice.due_date < today);
    totals.outstanding += cents;
    facts.unpaidInvoices.push({ invoiceNumber: invoice.invoice_number, customer, amount, dueDate: invoice.due_date, status });
    if (isOverdue) {
      totals.overdue += cents;
      facts.overdueInvoices.push({ invoiceNumber: invoice.invoice_number, customer, amount, dueDate: invoice.due_date as string });
    }
    if (customer) {
      const byCur = outstandingByCustomer.get(customer) ?? new Map<string, number>();
      byCur.set(cur, (byCur.get(cur) ?? 0) + cents);
      outstandingByCustomer.set(customer, byCur);
    }
  }

  for (const [cur, totals] of totalsByCurrency) {
    facts.currencies[cur] = {
      paidTotal: formatMoney(totals.paid, cur),
      outstandingTotal: formatMoney(totals.outstanding, cur),
      overdueTotal: formatMoney(totals.overdue, cur),
    };
  }
  for (const [customer, byCur] of outstandingByCustomer) {
    for (const [cur, cents] of byCur) {
      facts.customerOutstanding.push({ customer, outstanding: formatMoney(cents, cur) });
    }
  }
  facts.unpaidInvoices = facts.unpaidInvoices.slice(0, 15);
  facts.overdueInvoices = facts.overdueInvoices.slice(0, 10);

  facts.recentTransactions = (transactionsRes.data ?? []).map((txn) => ({
    date: String(txn.created_at).slice(0, 10),
    customer: txn.payer_name ?? null,
    amount: formatMoney(txn.amount_cents as number, txn.currency as string),
    status: txn.status as string,
  }));

  return facts;
}

async function businessAssistant(req: Request, client: SupabaseClient, admin: SupabaseClient, userId: string) {
  const { question } = assistantBody.parse(await req.json());
  const facts = await buildFacts(client, userId);

  const prompt = [
    "You are the business assistant inside an invoicing and payments app.",
    "Answer the owner's question using ONLY the facts JSON below. These facts are the authoritative records.",
    "Never invent invoices, customers, transactions, amounts, or percentages.",
    "If the facts do not contain the answer, say what is missing.",
    "Distinguish paid (received) amounts from outstanding (unpaid) amounts. Keep the answer concise and practical.",
    "When asked how to improve collections, suggest concrete steps based on the facts.",
    "",
    `Facts JSON: ${JSON.stringify(facts)}`,
    "",
    `Owner question: ${question}`,
  ].join("\n");

  const raw = await callGemini(prompt, geminiSchemaAssistant);
  const { answer } = parseModelJson(raw, assistantOutput);

  await admin.from("ai_generations").insert({
    user_id: userId,
    kind: "business_assistant",
    prompt: question,
    result: { answer },
    model: GEMINI_MODEL,
  });

  return json({ answer, model: GEMINI_MODEL });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const route = new URL(req.url).pathname.replace(/^.*\/ai/, "").replace(/\/$/, "");
    if (req.method !== "POST" || (route !== "/invoice-draft" && route !== "/business-assistant")) {
      return json({ error: "Not found." }, 404);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const client = userClient(authHeader);
    const admin = adminClient();
    const userId = await requireUser(req, client);

    if (route === "/invoice-draft") return await invoiceDraft(req, client, admin, userId);
    return await businessAssistant(req, client, admin, userId);
  } catch (err) {
    if (err instanceof HttpError) return json({ error: err.message }, err.status);
    if (err instanceof z.ZodError) return json({ error: "The request is invalid. Please check the fields and try again." }, 400);
    console.error("ai function failed", err instanceof Error ? err.message : "unknown error");
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
