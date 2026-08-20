// Public read-only view of the market-data provider chain health.
//
// This endpoint mirrors the "diagnosable without shell access" principle
// from routes/auth-providers.ts. When a user reports "the markets tab is
// blank", the operator visits /api/market/providers and reads which lane
// is open, which is cooling down, and why — the same way callbackBase on
// /api/auth-providers made the OAuth redirect_uri mismatch legible without
// production shell.
//
// ── What this endpoint EXPOSES ──────────────────────────────────────────────
//   • Provider name (yahoo, alpaca, polygon, twelvedata, frankfurter)
//   • configured: true|false (env keys present — MUST NOT leak the key)
//   • Circuit-breaker state (closed|open|half) and cooldownUntil
//   • lastOk / lastError (message + timestamp only, no auth payload)
//   • Daily credit budget used and remaining (Twelve Data)
//
// ── What this endpoint MUST NOT EXPOSE ──────────────────────────────────────
//   • Any API key value (even partial, even hashed)
//   • Any userId — this is a public endpoint, mounted BEFORE requireAuth
//     so the sign-in page and status widgets can call it. There is no
//     current-user context here.
//   • Any per-user quota or per-user request count.
//
// Kept in a separate router file from routes/market.ts so it can be
// mounted before requireAuth in app.ts. Merging it into the main market
// router would put it behind auth — same trap that produced the 401 not
// 404 on the earlier attempt.

import { Router, type IRouter } from "express";
import { getProviderHealth } from "../lib/provider-health";

const router: IRouter = Router();

// GET /api/market/providers
//   {
//     "providers": [
//       { name: "alpaca", configured: true, breaker: "closed", ... },
//       { name: "frankfurter", configured: true, breaker: "closed", ... },
//       { name: "polygon", configured: true, breaker: "open",
//         cooldownUntil: "2026-08-20T20:15:04Z",
//         lastError: { message: "Polygon HTTP 429", ts: "..." } },
//       { name: "twelvedata", configured: false, ... },  // key missing
//       { name: "yahoo", configured: true, breaker: "half",
//         lastOk: "2026-08-20T20:14:33Z" }
//     ]
//   }
router.get("/market/providers", (_req, res) => {
  res.json({ providers: getProviderHealth() });
});

export default router;
