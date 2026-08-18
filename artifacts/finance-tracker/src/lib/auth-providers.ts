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
  // Non-null when the fetch itself failed (network, 5xx). Callers
  // must treat "we don't know what's configured" as "render
  // nothing" — never as "render everything hopefully".
  error: string | null;
}

const INITIAL: AuthProvidersState = {
  loading: true,
  providers: [],
  passwordResetEnabled: false,
  error: null,
};

interface Response {
  providers: ProviderId[];
  passwordResetEnabled: boolean;
}

// The endpoint lives at /api on the same origin (dev proxy points
// /api to the API server; production has the same rewrite via the
// financetracker.work proxy).
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
            error: null,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            loading: false,
            providers: [],
            passwordResetEnabled: false,
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
