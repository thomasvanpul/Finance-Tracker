import { Router, type IRouter } from "express";

const router: IRouter = Router();

const MAX_MESSAGES = 20;
const MAX_MESSAGE_LEN = 4000;
const MAX_CONTEXT_LEN = 2000;

const SYSTEM_PROMPT = `You are a smart financial assistant built into Finance Tracker, a personal finance application.
You help users with: budgeting, expense tracking, investment analysis, tax planning, savings goals, debt management, and general financial questions.
Keep responses concise and actionable. Use numbers and specifics when helpful. When the user shares financial details, provide tailored advice.
If asked about specific prices or live market data, clarify you don't have real-time data access.
You can explain financial concepts, help interpret their data, suggest strategies, and answer "what if" scenarios.`;

router.post("/ai/chat", async (req, res): Promise<void> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
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

  const contents = messages.map((m) => ({
    role: m.role,
    parts: [{ text: m.text }],
  }));

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { maxOutputTokens: 1024, temperature: 0.7 },
        }),
      },
    );

    if (!response.ok) {
      const err = await response.text();
      res.status(502).json({ error: `Gemini API error: ${response.status}`, detail: err });
      return;
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content: { parts: Array<{ text: string }> } }>;
      error?: { message: string };
    };

    if (data.error) {
      res.status(502).json({ error: data.error.message });
      return;
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    res.json({ text });
  } catch {
    res.status(502).json({ error: "Failed to reach AI service" });
  }
});

router.get("/ai/status", (_req, res): void => {
  res.json({ available: !!process.env.GEMINI_API_KEY });
});

export default router;
