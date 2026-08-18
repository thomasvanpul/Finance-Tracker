// Single source of truth for which auth providers the UI is
// allowed to show. The frontend consumes this and NEVER decides
// on its own — no build-time VITE_* env may drive whether a
// provider button renders. That is the lesson from the wasted
// hour on a Google button that was live while its redirect URI
// wasn't registered: build-time flags don't know about server
// configuration or provider consoles.
//
// A provider appears in the response iff the server has the
// minimum credential pair set at runtime AND that pair is
// non-empty. If the response omits a provider, the button MUST
// NOT render. Callers should treat this endpoint as the button's
// enable gate.
//
// The response also carries `passwordResetEnabled` — the
// forgot-password flow depends on RESEND_API_KEY being set on
// the server. If it isn't, we don't show the "Forgot password?"
// link, because clicking it today would tell the user to check
// an inbox that will never receive anything.
//
// This endpoint is public (no auth) because the buttons need to
// render before the user has signed in. Nothing sensitive
// escapes — the response is a shape, not a credential.

import { Router, type IRouter } from "express";

const router: IRouter = Router();

// Minimum-credential rule per provider. If both fields are set
// (non-empty after trim), the provider is considered configured.
// Callers depend on this: adding a new provider means listing it
// here AND wiring it in better-auth.ts.
interface ProviderRequirements {
  id: "google" | "apple" | "github";
  envKeys: readonly string[];
}

const REQUIREMENTS: ProviderRequirements[] = [
  { id: "google", envKeys: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"] as const },
  { id: "apple",  envKeys: ["APPLE_CLIENT_ID", "APPLE_CLIENT_SECRET"] as const },
  { id: "github", envKeys: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"] as const },
];

function isConfigured(req: ProviderRequirements): boolean {
  return req.envKeys.every((k) => {
    const v = process.env[k];
    return typeof v === "string" && v.trim().length > 0;
  });
}

// GET /api/auth-providers
// Response:
//   {
//     "providers": ["google"],           // only providers ready to use
//     "passwordResetEnabled": true       // false if RESEND_API_KEY missing
//   }
router.get("/auth-providers", (_req, res) => {
  const providers = REQUIREMENTS.filter(isConfigured).map((r) => r.id);
  const passwordResetEnabled =
    typeof process.env.RESEND_API_KEY === "string" &&
    process.env.RESEND_API_KEY.trim().length > 0;
  res.json({ providers, passwordResetEnabled });
});

export default router;
export { REQUIREMENTS as __PROVIDER_REQUIREMENTS_FOR_TESTS };
