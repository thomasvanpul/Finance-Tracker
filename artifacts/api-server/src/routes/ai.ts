// AI routes. Every handler dispatches through the provider chain
// (lib/ai-providers/chain.ts) rather than calling one vendor directly:
//   • chainChat        walks Groq → Cerebras → OpenRouter
//   • chainCategorize  walks Groq (small model) → Cerebras → OpenRouter (nano)
//   • chainVision      walks Groq (qwen3.6-27b) → Cerebras (gemma) → OpenRouter (gemma-4-31b)
//
// Rationale: Gemini alone produced three separate failures inside a
// week (retired model, silent catches, key-format mismatch), and the
// key format on this account is permanently incompatible with the
// Generative Language REST API — so Gemini was pulled 2026-08-23 and
// replaced with OpenRouter as the tertiary lane. One provider is a
// single point of failure and we already have the pattern from the
// market chain.
//
// Every response carries servingProvider + reducedCapacity so the UI
// can render a quiet "reduced capacity" chrome when we fall through
// to Cerebras or OpenRouter. Same principle as the market stale-serve:
// degraded is fine, degraded-and-silent is not.

import { Router, type IRouter } from "express";
import { getAiHealth } from "../lib/ai-config";
import { chainChat, chainChatStream, chainCategorize, chainVision } from "../lib/ai-providers/chain";
import { buildChatContext, buildCategorizeContext, buildReceiptScanContext, type ContextProgress } from "../lib/ai-context";
import { logger } from "../lib/logger";
import { AiChatRequestSchema } from "@workspace/api-zod";

const router: IRouter = Router();

// ── Latency instrumentation ───────────────────────────────────────────────
// Every AI endpoint emits a single structured "ai.timing" log line so we
// can grep Render for a real distribution of context-assembly vs model
// latency, instead of estimating. Reading "Failed to fetch" from the
// browser tells us nothing about which stage stalled — this line does.
//
// Grep pattern (Render logs):  msg=="ai.timing"
// Fields: route, ctxMs, modelMs, totalMs, contextChars, sectionsDropped,
//         messageCount (chat only), servingProvider, reducedCapacity,
//         triedProviders, ok.
//
// KEEP the log at info level — this fires on every AI request and is
// the only way to answer "which stage is slow?" from a live server.
// NEVER include the assembled context text in this log (see
// lib/ai-context.ts L3): fields are numbers + names only.
interface AiTimingFields {
  route: string;
  ctxMs: number;
  modelMs: number;
  totalMs: number;
  contextChars?: number;
  sectionsDropped?: string[];
  messageCount?: number;
  servingProvider?: string | null;
  reducedCapacity?: boolean;
  triedProviders?: string[];
  ok: boolean;
}
function logTiming(fields: AiTimingFields): void {
  logger.info(fields, "ai.timing");
}
function ms(startNs: bigint): number {
  return Number(process.hrtime.bigint() - startNs) / 1_000_000;
}

// Generic client-facing error when the whole chain is exhausted. The
// operator gets provider-specific detail via the pino logs each
// adapter emits; the user sees only this.
const CLIENT_FAILURE = "The AI service is temporarily unavailable. Please try again in a moment.";

// Return 503 if NO provider is currently keyed. Any request to an AI
// endpoint when zero providers exist would fail anyway — telling the
// caller "unconfigured" is more actionable than "temporarily
// unavailable". `available` from getAiHealth() reflects verified state;
// this pre-flight only checks keys since verification can be null
// pending boot and we still want the chain to try.
function anyProviderKeyed(): boolean {
  return getAiHealth().providers.some((p) => p.keyConfigured);
}

// Message-count + text-length caps live in @workspace/api-zod
// (AiChatRequestSchema) so the client sees the same limits without
// a rename risk. Path is capped there too — no need for a separate
// slice here.

// Base system prompt. The USER PORTFOLIO CONTEXT block is appended
// server-side after being built from the user's own rows via
// lib/ai-context.ts — the client no longer assembles or posts any
// financial data. Keeping the delimiter and the "read-only data"
// wording is load-bearing for prompt-injection separation: the model
// treats what's between the delimiters as data, not instructions.
//
// The freshness / confidence paragraph is the ask from Thomas — the
// model must not overstate certainty about numbers it read from the
// data block, and must never guess a value shown as "unknown".
const SYSTEM_PROMPT = `You are a smart financial assistant built into Finance Tracker, a personal finance application.
You help users with: budgeting, expense tracking, investment analysis, tax planning, savings goals, debt management, and general financial questions.
Keep responses concise and actionable. Use numbers and specifics when helpful.
If asked about specific prices or live market data, clarify you don't have real-time data access.
You can explain financial concepts, help interpret their data, suggest strategies, and answer "what if" scenarios.

The USER PORTFOLIO CONTEXT block below contains the user's own data as of the timestamp shown. Some values may be marked "unknown" — this means the app could not compute them (usually FX conversion failed or a live quote is missing). Never guess a value shown as "unknown". Never state a number as certain — the user's data can be stale or incomplete. If they ask about something not in the context (a specific transaction, holding, or merchant), say you can see aggregates only and suggest the relevant page.`;

// requireAuth (app.ts) writes session.user.id to req.userId. Every
// route below requires it — the caller mounts these behind auth.
function userIdOf(req: import("express").Request): string {
  return (req as unknown as { userId: string }).userId;
}

// SSE emit helper. Each event is one blank-line-terminated block:
//   event: <type>\n
//   data: <json>\n
//   \n
// See client/ai-agent.tsx for the matching parser. Never puts context
// text on the wire (progress events carry pipeline metadata only —
// L3 in lib/ai-context.ts).
function sseWrite(res: import("express").Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

router.post("/ai/chat", async (req, res): Promise<void> => {
  if (!anyProviderKeyed()) {
    res.status(503).json({ error: "AI assistant is not configured on this server." });
    return;
  }

  // Body validation via the shared @workspace/api-zod schema so client
  // and server can't drift on field names, role union, or length
  // caps. The ai-chat-contract test locks the wire the client emits
  // against this same schema.
  const parsed = AiChatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    res.status(400).json({
      error: first ? `${first.path.join(".") || "body"}: ${first.message}` : "invalid request body",
    });
    return;
  }
  const { messages, path } = parsed.data;

  // ── SSE mode ──
  // First-token latency (not total-completion latency) is the actual UX
  // metric here. Streaming context-assembly progress + model tokens
  // means the user sees SOMETHING within a few hundred ms rather than
  // staring at a spinner. It also breaks the "no bytes flowing" failure
  // mode that Render's edge, browsers, and every proxy in between kill
  // sockets on — a stream that emits every ~100ms stays alive
  // indefinitely.
  //
  // Progress events are driven by REAL server actions inside
  // buildChatContext + chainChatStream. No scripted animation, no
  // fabricated "thinking…" text. If the model exposes reasoning tokens
  // later (Groq gpt-oss family sometimes does), those get their own
  // event kind — for now, content tokens only.
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx/proxy buffering
  res.flushHeaders();

  const totalStart = process.hrtime.bigint();
  // path is already ≤200 chars per the schema.
  const safePath = path;

  // Forward each real context stage to the client as it happens.
  // Names/details come from lib/ai-context.ts ContextProgress union —
  // every event maps to a point in the pipeline where work IS
  // actually starting.
  const ctxStart = process.hrtime.bigint();
  let context: Awaited<ReturnType<typeof buildChatContext>>;
  try {
    context = await buildChatContext(userIdOf(req), safePath, (event: ContextProgress) => {
      sseWrite(res, "progress", event);
    });
  } catch (err) {
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "ai.chat context assembly failed");
    sseWrite(res, "error", { message: CLIENT_FAILURE });
    res.end();
    return;
  }
  const ctxMs = ms(ctxStart);
  const systemPrompt = `${SYSTEM_PROMPT}\n\n--- USER PORTFOLIO CONTEXT (read-only data) ---\n${context.text}\n--- END CONTEXT ---`;

  const modelStart = process.hrtime.bigint();
  let servingProvider: string | null = null;
  let reducedCapacity = false;
  let triedProviders: string[] = [];
  let ok = false;
  let tokensSent = 0;

  try {
    for await (const event of chainChatStream({
      messages,
      systemPrompt,
      route: "ai.chat",
      maxTokens: 1024,
      temperature: 0.7,
    })) {
      if (event.kind === "attempt") {
        sseWrite(res, "attempt", { provider: event.provider, attemptIndex: event.attemptIndex });
      } else if (event.kind === "fallthrough") {
        sseWrite(res, "fallthrough", { from: event.from, to: event.to, reason: event.reason });
      } else if (event.kind === "token") {
        tokensSent += 1;
        sseWrite(res, "token", { text: event.text });
      } else if (event.kind === "done") {
        servingProvider = event.servingProvider;
        reducedCapacity = event.reducedCapacity;
        triedProviders = event.triedProviders;
        ok = true;
        sseWrite(res, "done", { servingProvider, reducedCapacity, triedProviders });
      } else if (event.kind === "cut") {
        servingProvider = event.servingProvider;
        triedProviders = event.triedProviders;
        // We got partial content — client already rendered it. Send
        // an honest "response ended early" note; do NOT fall through
        // to another provider and blend two completions.
        sseWrite(res, "cut", { servingProvider, reason: event.reason, triedProviders });
      } else if (event.kind === "exhausted") {
        triedProviders = event.triedProviders;
        sseWrite(res, "error", { message: CLIENT_FAILURE, triedProviders });
      }
    }
  } catch (err) {
    // Should be unreachable — the generator handles its own errors
    // and yields "cut" or "exhausted" instead of throwing. Belt-and-
    // braces: send a generic error so the client doesn't hang on a
    // half-open stream.
    logger.error({ err: err instanceof Error ? err.message : String(err) }, "ai.chat stream loop threw unexpectedly");
    sseWrite(res, "error", { message: CLIENT_FAILURE });
  } finally {
    const modelMs = ms(modelStart);
    const totalMs = ms(totalStart);
    logTiming({
      route: "ai.chat",
      ctxMs, modelMs, totalMs,
      contextChars: context.text.length,
      sectionsDropped: context.sectionsDropped,
      messageCount: messages.length,
      servingProvider,
      reducedCapacity,
      triedProviders,
      ok,
    });
    // Include tokens-sent in the timing log so a "cut" mid-stream is
    // visible as `tokensSent > 0 && !ok`. Also useful for latency
    // analysis: streaming success with 0 tokensSent would be a bug.
    logger.info({ route: "ai.chat", tokensSent, ok, servingProvider }, "ai.stream.summary");
    res.end();
  }
});

// ── Bill split receipt analysis ───────────────────────────────────────────────

router.post("/ai/receipt-split", async (req, res): Promise<void> => {
  if (!anyProviderKeyed()) {
    res.status(503).json({ error: "AI assistant is not configured on this server." });
    return;
  }

  const { imageBase64, mimeType, members } = req.body as {
    imageBase64?: string;
    mimeType?: string;
    members?: string[];
  };

  if (!imageBase64 || typeof imageBase64 !== "string") {
    res.status(400).json({ error: "imageBase64 is required" });
    return;
  }
  if (!Array.isArray(members) || members.length === 0) {
    res.status(400).json({ error: "members array is required" });
    return;
  }

  const safeMime = typeof mimeType === "string" ? mimeType : "image/jpeg";
  const safeMembers = members.slice(0, 20).map(String);
  const memberList = safeMembers.join(", ");

  const prompt = `Analyze this receipt image and extract every line item. The bill will be split among: ${memberList}.

Return ONLY valid JSON (no markdown fences) in this exact structure:
{
  "items": [
    {"name": "Item name", "price": 0.00}
  ],
  "subtotal": 0.00,
  "tax": 0.00,
  "tip": 0.00,
  "total": 0.00,
  "suggestions": [
    {
      "label": "Equal Split",
      "description": "Total divided equally among all ${safeMembers.length} people",
      "shares": ${JSON.stringify(Object.fromEntries(safeMembers.map((m) => [m, 0])))}
    },
    {
      "label": "Subtotal Only",
      "description": "Split the food subtotal equally, excluding tax and tip",
      "shares": ${JSON.stringify(Object.fromEntries(safeMembers.map((m) => [m, 0])))}
    },
    {
      "label": "Custom",
      "description": "Suggested split based on item prices (estimate each person's share)",
      "shares": ${JSON.stringify(Object.fromEntries(safeMembers.map((m) => [m, 0])))}
    }
  ]
}

Rules:
- "items" must list every individual item on the receipt with its price
- For "suggestions[0]" (Equal Split): divide total equally among all members
- For "suggestions[1]" (Subtotal Only): divide subtotal equally; 0 tax/tip
- For "suggestions[2]" (Custom): distribute items as evenly as possible across members by alternating assignment
- All shares in each suggestion must sum to that suggestion's total amount
- If you cannot read a value, use 0
- Return raw JSON only`;

  // Receipt-split doesn't build a user context (members come from the
  // request body), so ctxMs is 0. We still emit the timing line so
  // production data covers every AI endpoint uniformly.
  const totalStart = process.hrtime.bigint();
  const modelStart = process.hrtime.bigint();
  const call = await chainVision({
    imageBase64,
    mimeType: safeMime,
    prompt,
    route: "ai.receipt-split",
    maxTokens: 1024,
    jsonMode: true,
  });
  const modelMs = ms(modelStart);
  logTiming({
    route: "ai.receipt-split",
    ctxMs: 0, modelMs, totalMs: ms(totalStart),
    contextChars: prompt.length,
    servingProvider: call.servingProvider,
    reducedCapacity: call.reducedCapacity,
    triedProviders: call.triedProviders,
    ok: call.ok,
  });
  if (!call.ok) {
    res.status(502).json({ error: CLIENT_FAILURE });
    return;
  }
  const rawText = call.text;
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    res.status(500).json({ error: "Failed to parse AI response", raw: rawText.slice(0, 500) });
    return;
  }
  // Wrap the AI's structured response so servingProvider + reducedCapacity
  // are always present. Client reads `.result` for the receipt data.
  res.json({
    result: parsed,
    servingProvider: call.servingProvider,
    reducedCapacity: call.reducedCapacity,
  });
});

// ── Receipt scanning ──────────────────────────────────────────────────────────

const RECEIPT_CATEGORIES = [
  "Food & Drink",
  "Transport",
  "Shopping",
  "Entertainment",
  "Bills & Utilities",
  "Health",
  "Travel",
  "Other",
] as const;

type ReceiptCategory = (typeof RECEIPT_CATEGORIES)[number];

interface ReceiptScanResult {
  merchant: string;
  amount: number;
  date: string;
  category: ReceiptCategory;
  currency: string;
}

router.post("/ai/receipt-scan", async (req, res): Promise<void> => {
  if (!anyProviderKeyed()) {
    res.status(503).json({ error: "AI assistant is not configured on this server." });
    return;
  }

  const { imageBase64, mimeType } = req.body as {
    imageBase64?: string;
    mimeType?: string;
  };

  if (!imageBase64 || typeof imageBase64 !== "string" || imageBase64.length === 0) {
    res.status(400).json({ error: "imageBase64 is required" });
    return;
  }

  const safeMimeType = typeof mimeType === "string" && mimeType.length > 0 ? mimeType : "image/jpeg";

  // Per-task context (L5 in lib/ai-context.ts): base currency + the
  // user's actual category vocabulary. NOT the full portfolio — a
  // receipt-scan doesn't need balances, and shipping them widens the
  // leak surface and wastes tokens on a call that only needs to
  // extract 5 fields from an image.
  const totalStart = process.hrtime.bigint();
  const ctxStart = process.hrtime.bigint();
  const scanCtx = await buildReceiptScanContext(userIdOf(req));
  const ctxMs = ms(ctxStart);

  const prompt = `${scanCtx.text}\n\nExtract from this receipt: merchant name, total amount (number only), date (YYYY-MM-DD format), category (prefer one from the vocabulary above; if nothing fits, use one of: Food & Drink, Transport, Shopping, Entertainment, Bills & Utilities, Health, Travel, Other), currency code. Return ONLY valid JSON: {"merchant": "...", "amount": 0.00, "date": "...", "category": "...", "currency": "GBP"}`;

  const modelStart = process.hrtime.bigint();
  const call = await chainVision({
    imageBase64,
    mimeType: safeMimeType,
    prompt,
    route: "ai.receipt-scan",
    maxTokens: 512,
    jsonMode: true,
  });
  const modelMs = ms(modelStart);
  logTiming({
    route: "ai.receipt-scan",
    ctxMs, modelMs, totalMs: ms(totalStart),
    contextChars: prompt.length,
    servingProvider: call.servingProvider,
    reducedCapacity: call.reducedCapacity,
    triedProviders: call.triedProviders,
    ok: call.ok,
  });
  if (!call.ok) {
    res.status(502).json({ error: CLIENT_FAILURE });
    return;
  }
  const rawText = call.text;
  // Strip markdown code fences if the model wraps the JSON
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

  let result: ReceiptScanResult;
  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;

    const merchant = typeof parsed.merchant === "string" ? parsed.merchant : "Unknown";
    const amount = typeof parsed.amount === "number" ? parsed.amount : parseFloat(String(parsed.amount ?? 0)) || 0;
    const date = typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)
      ? parsed.date
      : new Date().toISOString().slice(0, 10);
    const rawCategory = typeof parsed.category === "string" ? parsed.category : "Other";
    const category: ReceiptCategory = (RECEIPT_CATEGORIES as readonly string[]).includes(rawCategory)
      ? (rawCategory as ReceiptCategory)
      : "Other";
    const currency = typeof parsed.currency === "string" && parsed.currency.length === 3
      ? parsed.currency.toUpperCase()
      : "GBP";

    result = { merchant, amount, date, category, currency };
  } catch {
    res.status(500).json({ error: "Failed to parse AI response", raw: rawText.slice(0, 500) });
    return;
  }

  res.json({
    ...result,
    servingProvider: call.servingProvider,
    reducedCapacity: call.reducedCapacity,
  });
});

// ── Batch auto-categorize ─────────────────────────────────────────────────────

const AI_CATEGORIES = [
  "Food & Drink",
  "Transport",
  "Shopping",
  "Entertainment",
  "Bills & Utilities",
  "Health",
  "Travel",
  "Income",
  "Savings",
  "Other",
];

const MAX_BATCH_SIZE = 200;

router.post("/ai/batch-categorize", async (req, res): Promise<void> => {
  if (!anyProviderKeyed()) {
    res.status(503).json({ error: "AI assistant is not configured on this server." });
    return;
  }

  const { transactions } = req.body as {
    transactions?: Array<{ id: number; description: string; amount: number; type: string }>;
  };

  if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
    res.status(400).json({ error: "transactions array is required" });
    return;
  }

  if (transactions.length > MAX_BATCH_SIZE) {
    res.status(400).json({ error: `Too many transactions (max ${MAX_BATCH_SIZE})` });
    return;
  }

  // Validate each transaction entry
  for (const tx of transactions) {
    if (typeof tx.id !== "number" || typeof tx.description !== "string") {
      res.status(400).json({ error: "Each transaction must have numeric id and string description" });
      return;
    }
  }

  // Per-task context (L5): the user's OWN category vocabulary. The
  // hardcoded AI_CATEGORIES fallback stays for a brand-new user with
  // no categories yet — but for anyone else the model gets their
  // actual labels so suggestions match what they already use. No
  // balances, no counterparties, no currency exposure — none of that
  // makes categorisation better and shipping it wastes quota.
  const totalStart = process.hrtime.bigint();
  const ctxStart = process.hrtime.bigint();
  const catCtx = await buildCategorizeContext(userIdOf(req));
  const ctxMs = ms(ctxStart);

  const prompt = `${catCtx.text}\n\nIf the user's vocabulary above is empty, fall back to: ${AI_CATEGORIES.join(", ")}.\n\nCategorize these financial transactions. Return ONLY a valid JSON array with objects containing "id" and "category" for each transaction. No markdown, no explanation — raw JSON only.\n\nTransactions:\n${JSON.stringify(transactions.map((t) => ({ id: t.id, description: t.description, amount: t.amount, type: t.type })))}`;

  const modelStart = process.hrtime.bigint();
  const call = await chainCategorize({
    prompt,
    route: "ai.batch-categorize",
    maxTokens: 4096,
  });
  const modelMs = ms(modelStart);
  logTiming({
    route: "ai.batch-categorize",
    ctxMs, modelMs, totalMs: ms(totalStart),
    contextChars: prompt.length,
    messageCount: transactions.length,
    servingProvider: call.servingProvider,
    reducedCapacity: call.reducedCapacity,
    triedProviders: call.triedProviders,
    ok: call.ok,
  });
  if (!call.ok) {
    res.status(502).json({ error: CLIENT_FAILURE });
    return;
  }
  const rawText = call.text;
  // Strip markdown code fences if the model wraps the JSON
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

  let suggestions: Array<{ id: number; category: string }>;
  try {
    const parsed = JSON.parse(cleaned) as unknown;
    if (!Array.isArray(parsed)) throw new Error("Expected array");
    suggestions = (parsed as Array<{ id: unknown; category: unknown }>)
      .filter((item) => typeof item.id === "number" && typeof item.category === "string")
      .map((item) => ({ id: item.id as number, category: item.category as string }));
  } catch {
    res.status(502).json({ error: "Failed to parse AI response", raw: rawText.slice(0, 500) });
    return;
  }

  res.json({
    suggestions,
    servingProvider: call.servingProvider,
    reducedCapacity: call.reducedCapacity,
  });
});

export default router;
