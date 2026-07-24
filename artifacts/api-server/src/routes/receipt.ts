import { Router, type Request, type Response } from "express";

const router = Router();

router.post("/parse", async (req: Request, res: Response): Promise<void> => {
  const { imageBase64, mimeType = "image/jpeg" } = req.body as {
    imageBase64: string;
    mimeType?: string;
  };

  if (!imageBase64) {
    res.status(400).json({ error: "No image provided" });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: "Gemini not configured" });
    return;
  }

  try {
    const prompt = `You are a receipt parser. Analyze this receipt image and extract transaction details.
Return ONLY a JSON object with these fields:
{
  "description": "merchant or payee name (short, max 40 chars)",
  "amount": 12.50,
  "date": "YYYY-MM-DD",
  "type": "expense",
  "category": "one of: Food, Dining, Groceries, Transport, Shopping, Entertainment, Health, Utilities, Travel, Other"
}
If you cannot read a field, omit it or use null. Return only valid JSON, no markdown.`;

    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inline_data: { mime_type: mimeType, data: imageBase64 } },
              ],
            },
          ],
          generationConfig: { temperature: 0, maxOutputTokens: 256 },
        }),
      },
    );

    if (!resp.ok) {
      const err = await resp.text();
      res.status(502).json({ error: "Gemini error", detail: err });
      return;
    }

    const geminiData = (await resp.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    // Strip markdown code fences if present
    const clean = text
      .replace(/```json?\n?/g, "")
      .replace(/```/g, "")
      .trim();
    const parsed = JSON.parse(clean) as unknown;

    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: "Failed to parse receipt", detail: String(err) });
  }
});

export default router;
