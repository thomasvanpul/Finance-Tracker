// Public read-only "is AI configured AND working on this server" endpoint.
//
// Prior versions:
//   • v1 reported {available: <keyPresent>} — true the entire time
//     gemini-2.0-flash was dead (three months invisible).
//   • v2 added per-Gemini-model boot verification and honest `available`.
//   • v3 (this one) reports EVERY provider (Groq, Cerebras, Gemini)
//     independently so the operator can see which lane in the chain
//     is live without a shell.
//
// Response shape:
//   {
//     available: true|false,          // at least one provider verified + keyed
//     providers: [
//       {
//         name: "groq",
//         keyConfigured: true|false,
//         models: [ configured model strings ],
//         modelsVerified: true|false|null,
//         verifiedAt: "2026-08-23T..." | null,
//         lastError: null | "fix-me sentence naming that provider's alternatives"
//       },
//       ...
//     ]
//   }
//
// Mounted BEFORE requireAuth in app.ts — same public-diagnostic surface
// as /api/auth-providers and /api/market/providers. No user data, no
// key values (sentinel-scan lock in the test file).

import { Router, type IRouter } from "express";
import { getAiHealth } from "../lib/ai-config";

const router: IRouter = Router();

router.get("/ai/status", (_req, res): void => {
  const health = getAiHealth();
  res.json(health);
});

export default router;
