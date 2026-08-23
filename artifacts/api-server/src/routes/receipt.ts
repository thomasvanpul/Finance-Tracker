// POST /api/receipt/parse — receipt-scan endpoint used by
// quick-add-transaction on the mobile flow.
//
// Was calling gemini-2.0-flash directly. That model retired 1 June
// 2026, and this route was the second half of the same "hardcoded
// model, no boot verify" defect that ai-config.ts was written to
// prevent — the /api/ai/* endpoints went through chainVision, this
// one didn't. Routed through chainVision 2026-08-23 so every
// vision-taking route now walks Groq → Cerebras → OpenRouter with
// the shared circuit breaker and reduced-capacity signal.

import { Router, type Request, type Response } from "express";
import { chainVision } from "../lib/ai-providers/chain";
import { buildReceiptScanContext } from "../lib/ai-context";
import { logger } from "../lib/logger";

const router = Router();

// Same shape ai.ts's /ai/receipt-split emits on failure. Kept generic
// so we don't leak upstream detail or model names to the client.
const CLIENT_FAILURE = "The AI service is temporarily unavailable. Please try again in a moment.";

router.post("/parse", async (req: Request, res: Response): Promise<void> => {
  const { imageBase64, mimeType = "image/jpeg" } = req.body as {
    imageBase64: string;
    mimeType?: string;
  };

  if (!imageBase64) {
    res.status(400).json({ error: "No image provided" });
    return;
  }

  // Per-task context (L5 in lib/ai-context.ts): the user's own
  // category vocabulary + base currency. NOT the full portfolio —
  // a receipt-parse only needs to extract 5 fields from an image.
  const userId = (req as unknown as { userId: string }).userId;
  const scanCtx = await buildReceiptScanContext(userId);

  const prompt = `${scanCtx.text}\n\nYou are a receipt parser. Analyze this receipt image and extract transaction details.
Return ONLY a JSON object with these fields:
{
  "description": "merchant or payee name (short, max 40 chars)",
  "amount": 12.50,
  "date": "YYYY-MM-DD",
  "type": "expense",
  "category": "prefer one from the vocabulary above; if nothing fits, use one of: Food, Dining, Groceries, Transport, Shopping, Entertainment, Health, Utilities, Travel, Other"
}
If you cannot read a field, omit it or use null. Return only valid JSON, no markdown.`;

  const chained = await chainVision({
    imageBase64,
    mimeType,
    prompt,
    route: "receipt.parse",
    maxTokens: 256,
    jsonMode: true,
  });

  if (!chained.ok) {
    res.status(503).json({ error: CLIENT_FAILURE });
    return;
  }

  // Some models still wrap JSON in markdown despite jsonMode being on.
  // Strip fences before parse, same defensive pattern as ai.ts.
  const clean = chained.text
    .replace(/```json?\n?/g, "")
    .replace(/```/g, "")
    .trim();

  try {
    const parsed = JSON.parse(clean) as unknown;
    res.json({
      ...(parsed as Record<string, unknown>),
      servingProvider: chained.servingProvider,
      reducedCapacity: chained.reducedCapacity,
    });
  } catch (err) {
    logger.warn(
      { route: "receipt.parse", servingProvider: chained.servingProvider, err: String(err), textSample: clean.slice(0, 200) },
      "receipt parse returned non-JSON text",
    );
    res.status(502).json({ error: "Could not parse receipt into JSON. Try a clearer image." });
  }
});

export default router;
