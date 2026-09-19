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
// The response also carries `passwordResetEnabled` — whether a
// reset link can actually be delivered, by email or by the
// dev-only log transport (lib/email-transport.ts). If
// it can't, we don't show the "Forgot password?" link, because
// clicking it would tell the user to check an inbox that will
// never receive anything.
//
// This endpoint is public (no auth) because the buttons need to
// render before the user has signed in. Nothing sensitive
// escapes — the response is a shape, not a credential.

import { Router, type IRouter } from "express";
import { isEmailDeliverable } from "../lib/email-transport";
import { REQUIRE_EMAIL_VERIFICATION } from "../lib/auth-policy";

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
//     "providers": ["google"],             // only providers ready to use
//     "passwordResetEnabled": true,        // false if no reset transport is live
//     "emailVerificationRequired": true,   // sign-up needs a confirmed address
//     "signUpEnabled": true                // false when the server cannot mail
//   }
router.get("/auth-providers", (_req, res) => {
  const providers = REQUIREMENTS.filter(isConfigured).map((r) => r.id);
  // Delegated, so the link the UI shows and the request the server will
  // actually honour can never disagree. app.ts refuses the reset endpoint
  // on exactly this answer. Before 2026-09-19 both sites tested
  // RESEND_API_KEY inline and the dev-log transport had nowhere to be seen.
  const passwordResetEnabled = isEmailDeliverable();
  // Passkeys have no server-side credential requirement — WebAuthn
  // is a browser + platform authenticator affair, and the plugin
  // always ships once wired in better-auth.ts. The value is always
  // true; the client is still responsible for feature-detecting
  // window.PublicKeyCredential before rendering the sign-in button.
  // Same "never render a control that cannot work" rule as social
  // providers, split across the two gates the fact actually has.
  const passkeyEnabled = true;
  // Whether a new account must confirm its address before it can sign in.
  // Read from the same constant the server enforces (lib/auth-policy.ts), so
  // the sign-up form's copy and better-auth's behaviour cannot disagree.
  const emailVerificationRequired = REQUIRE_EMAIL_VERIFICATION;
  // And whether sign-up is open AT ALL. app.ts refuses sign-up with 503 when
  // verification is required and no mail transport is live; this is the same
  // answer, offered before the user types anything, so the form is hidden
  // rather than failing on submit. Same rule as the social buttons: never
  // render a control that cannot work.
  const signUpEnabled = !REQUIRE_EMAIL_VERIFICATION || isEmailDeliverable();
  // The base better-auth actually resolved, so a redirect_uri
    // mismatch is diagnosable without shell access to the host.
    // Not a secret — it appears in every OAuth URL we generate.
    const callbackBase =
      process.env.API_BASE_URL ??
      process.env.RENDER_EXTERNAL_URL ??
      (process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : "http://localhost:3000");

    res.json({
      callbackBase,
      providers,
      passwordResetEnabled,
      passkeyEnabled,
      emailVerificationRequired,
      signUpEnabled,
    });
});

export default router;
export { REQUIREMENTS as __PROVIDER_REQUIREMENTS_FOR_TESTS };
