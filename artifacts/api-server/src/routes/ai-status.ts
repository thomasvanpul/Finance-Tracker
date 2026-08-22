// Public read-only "is AI configured AND working on this server" endpoint.
//
// Prior version reported {available: <keyPresent>} — which was true the
// entire time gemini-2.0-flash was dead (three months). Key-presence
// is not the same as "the thing works". This endpoint now reports what
// it actually knows: env key, configured model, and whether that model
// was found in Google's models list at boot.
//
// `available: true` now means BOTH the key is set AND the configured
// model was verified live at last boot. A client that reads only
// `available` continues to work but with truthful semantics.
//
// Mounted BEFORE requireAuth in app.ts. Same public-diagnostic category
// as /api/auth-providers and /api/market/providers — no user data, no
// key value, safe to expose so an operator can `curl` production and
// see AI's true state without shell or session.

import { Router, type IRouter } from "express";
import { getAiHealth } from "../lib/ai-config";

const router: IRouter = Router();

router.get("/ai/status", (_req, res): void => {
  const health = getAiHealth();
  // available = key set AND model confirmed present in Google's list.
  // A `null` modelVerified (boot check didn't run / errored) counts as
  // NOT available — better to report "unknown, treat as broken" than
  // false-optimistic. Once the boot check succeeds, this flips true.
  const available = health.keyConfigured && health.modelVerified === true;
  res.json({
    available,
    keyConfigured: health.keyConfigured,
    model: health.model,
    modelVerified: health.modelVerified,
    modelVerifiedAt: health.modelVerifiedAt,
    // lastError carries the fix-me sentence when verification failed
    // (see ai-config.ts) so an operator sees the recovery step
    // directly in the endpoint response, not just in Render logs.
    lastError: health.lastError,
  });
});

export default router;
