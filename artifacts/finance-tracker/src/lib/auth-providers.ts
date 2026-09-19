// Frontend consumer of GET /api/auth-providers.
//
// This is the single source of truth for which provider buttons
// may render. NO other module — component, env flag, build-time
// constant — decides. The wasted-hour incident on a live Google
// button with an unregistered redirect URI is the reason: a
// build-time VITE_* flag cannot know about server or provider-
// console state.
//
// The hook returns a snapshot including a `loading` flag so the
// UI can leave provider slots blank on first render rather than
// flash a button that then disappears when the response arrives.

import { useEffect, useState } from "react";

export type ProviderId = "google" | "apple" | "github";

export interface AuthProvidersState {
  loading: boolean;
  providers: ProviderId[];
  passwordResetEnabled: boolean;
  // Server-side gate for passkeys. The browser-side gate is a
  // separate feature-detect against window.PublicKeyCredential —
  // callers must check BOTH before rendering the passkey button.
  passkeyEnabled: boolean;
  // Whether a new account must confirm its address before it can sign in.
  // Drives the sign-up form's copy and the "check your inbox" screen, so
  // the UI never promises a session the server will not grant.
  emailVerificationRequired: boolean;
  // Whether sign-up is open at all. False when verification is required and
  // the server has no mail transport — app.ts refuses those sign-ups with
  // 503, and this is the same answer offered before anyone types. Same rule
  // as the provider buttons: never render a control that cannot work.
  signUpEnabled: boolean;
  // Non-null when the fetch itself failed (network, 5xx). Callers
  // must treat "we don't know what's configured" as "render
  // nothing" — never as "render everything hopefully".
  error: string | null;
}

const INITIAL: AuthProvidersState = {
  loading: true,
  providers: [],
  passwordResetEnabled: false,
  passkeyEnabled: false,
  // Assume verification IS required until told otherwise. The wrong
  // direction to fail is promising an instant session and then dropping
  // the user back on a sign-in form with no explanation.
  emailVerificationRequired: true,
  // But assume sign-up is NOT open until told otherwise, for the same
  // fail-closed reason the provider list starts empty.
  signUpEnabled: false,
  error: null,
};

interface Response {
  providers: ProviderId[];
  passwordResetEnabled: boolean;
  passkeyEnabled?: boolean;
  emailVerificationRequired?: boolean;
  signUpEnabled?: boolean;
}

// The endpoint lives at /api on the same origin (dev proxy points
// /api to the API server; production has the same rewrite, whatever
// host is serving the SPA — see artifacts/finance-tracker/vercel.json).
const ENDPOINT = "/api/auth-providers";

export function useAuthProviders(): AuthProvidersState {
  const [state, setState] = useState<AuthProvidersState>(INITIAL);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(ENDPOINT, {
          method: "GET",
          headers: { Accept: "application/json" },
          credentials: "include",
        });
        if (!res.ok) {
          if (!cancelled) {
            setState({
              loading: false,
              providers: [],
              passwordResetEnabled: false,
              passkeyEnabled: false,
              emailVerificationRequired: true,
              signUpEnabled: false,
              error: `providers endpoint returned ${res.status}`,
            });
          }
          return;
        }
        const body = (await res.json()) as Response;
        if (!cancelled) {
          setState({
            loading: false,
            providers: Array.isArray(body.providers) ? body.providers : [],
            passwordResetEnabled: !!body.passwordResetEnabled,
            // Default false when the field is absent — an older
            // server bundle that pre-dates the passkey rollout
            // is authoritatively "no passkey support" from the
            // client's view.
            passkeyEnabled: !!body.passkeyEnabled,
            // Absent field -> assume required. An older server bundle that
            // pre-dates the verification rollout is the one case where
            // guessing "not required" would be right, and it is also the
            // case where guessing wrong is harmless: the copy says an email
            // is coming, and one does.
            emailVerificationRequired: body.emailVerificationRequired !== false,
            signUpEnabled: !!body.signUpEnabled,
            error: null,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            loading: false,
            providers: [],
            passwordResetEnabled: false,
            passkeyEnabled: false,
            emailVerificationRequired: true,
            signUpEnabled: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
