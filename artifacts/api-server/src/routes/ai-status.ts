// Public read-only "is AI configured on this server" endpoint.
//
// Follows the same shape as /api/auth-providers and /api/market/providers:
// reports capability (env-key presence, not the key itself) so the
// operator can diagnose "why isn't the AI panel doing anything" from
// outside without shell access to the host. And so the sign-in-page
// UI can decide whether to render an AI teaser without needing a
// session first.
//
// Mounted BEFORE requireAuth in app.ts. Kept in its own router file
// (not merged into routes/ai.ts) because everything else in ai.ts is
// authenticated — chat, receipt-split, ai-categorize all take user
// prompts and cost money to serve.
//
// ── What this endpoint EXPOSES ──────────────────────────────────────────────
//   • { available: true|false } — is GEMINI_API_KEY set?
//
// ── What this endpoint MUST NOT EXPOSE ──────────────────────────────────────
//   • Any part of the API key (even hashed, even partial)
//   • Any user data — this is public
//   • Which model is used (Gemini-2.0-flash vs -pro) — leaks vendor cost

import { Router, type IRouter } from "express";

const router: IRouter = Router();

router.get("/ai/status", (_req, res): void => {
  res.json({ available: !!process.env.GEMINI_API_KEY });
});

export default router;
