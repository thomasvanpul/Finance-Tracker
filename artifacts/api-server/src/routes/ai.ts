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
import { chainChat, chainCategorize, chainVision } from "../lib/ai-providers/chain";

const router: IRouter = Router();

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

const MAX_MESSAGES = 20;
const MAX_MESSAGE_LEN = 4000;
const MAX_CONTEXT_LEN = 2000;

const SYSTEM_PROMPT = `You are a smart financial assistant built into Finance Tracker, a personal finance application.
You help users with: budgeting, expense tracking, investment analysis, tax planning, savings goals, debt management, and general financial questions.
Keep responses concise and actionable. Use numbers and specifics when helpful. When the user shares financial details, provide tailored advice.
If asked about specific prices or live market data, clarify you don't have real-time data access.
You can explain financial concepts, help interpret their data, suggest strategies, and answer "what if" scenarios.`;

router.post("/ai/chat", async (req, res): Promise<void> => {
  if (!anyProviderKeyed()) {
    res.status(503).json({ error: "AI assistant is not configured on this server." });
    return;
  }

  const { messages, context } = req.body as {
    messages?: Array<{ role: "user" | "model"; text: string }>;
    context?: string;
  };

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  if (messages.length > MAX_MESSAGES) {
    res.status(400).json({ error: `Too many messages (max ${MAX_MESSAGES})` });
    return;
  }

  for (const m of messages) {
    if (!["user", "model"].includes(m.role)) {
      res.status(400).json({ error: "Invalid message role" });
      return;
    }
    if (typeof m.text !== "string" || m.text.length === 0 || m.text.length > MAX_MESSAGE_LEN) {
      res.status(400).json({ error: `Message text must be 1–${MAX_MESSAGE_LEN} characters` });
      return;
    }
  }

  // Context is passed as a separate user-data section, not appended to the system prompt,
  // to reduce prompt injection surface area.
  let systemPrompt = SYSTEM_PROMPT;
  if (context && typeof context === "string") {
    const safeContext = context.slice(0, MAX_CONTEXT_LEN);
    systemPrompt += `\n\n--- USER PORTFOLIO CONTEXT (read-only data) ---\n${safeContext}\n--- END CONTEXT ---`;
  }

  const result = await chainChat({
    messages,
    systemPrompt,
    route: "ai.chat",
    maxTokens: 1024,
    temperature: 0.7,
  });

  if (!result.ok) {
    res.status(502).json({ error: CLIENT_FAILURE });
    return;
  }
  res.json({
    text: result.text,
    // Chain metadata — the UI reads reducedCapacity to render the
    // "reduced capacity" chrome and can show servingProvider in a
    // debug view. Both are diagnostic, not sensitive.
    servingProvider: result.servingProvider,
    reducedCapacity: result.reducedCapacity,
  });
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

  const call = await chainVision({
    imageBase64,
    mimeType: safeMime,
    prompt,
    route: "ai.receipt-split",
    maxTokens: 1024,
    jsonMode: true,
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

  const call = await chainVision({
    imageBase64,
    mimeType: safeMimeType,
    prompt: 'Extract from this receipt: merchant name, total amount (number only), date (YYYY-MM-DD format), category (one of: Food & Drink, Transport, Shopping, Entertainment, Bills & Utilities, Health, Travel, Other), currency code. Return ONLY valid JSON: {"merchant": "...", "amount": 0.00, "date": "...", "category": "...", "currency": "GBP"}',
    route: "ai.receipt-scan",
    maxTokens: 512,
    jsonMode: true,
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

  const prompt = `Categorize these financial transactions. Return ONLY a valid JSON array with objects containing "id" and "category" for each transaction. No markdown, no explanation — raw JSON only.

Available categories: ${AI_CATEGORIES.join(", ")}.

Transactions:
${JSON.stringify(transactions.map((t) => ({ id: t.id, description: t.description, amount: t.amount, type: t.type })))}`;

  const call = await chainCategorize({
    prompt,
    route: "ai.batch-categorize",
    maxTokens: 4096,
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
