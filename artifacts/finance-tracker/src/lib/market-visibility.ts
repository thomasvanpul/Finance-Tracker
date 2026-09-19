// Does this deployment serve market data at all?
//
// One hook, one answer, consulted by every surface that would otherwise
// render a quote: the desktop ticker bar and market-status clock, the
// Markets nav entry, the market-snapshot widget and its compact tile, the
// markets and derivatives tabs, the phone's MARKETS tab and its home
// section. The server decision lives in
// api-server/src/lib/market-flag.ts; this is the client half of it.
//
// ── Why the server is asked rather than the build ──────────────────────────
//
// A build-time VITE_* flag cannot know what the server decided. This repo
// has the scar: a Google sign-in button was live in a build while its
// redirect URI was unregistered on the server side, and the rule that came
// out of it — the server is the single source of truth for what may render —
// is written at the top of lib/auth-providers.ts. Markets are the same
// shape, with a sharper edge: the reason they are off is a licence, and a
// stale bundle rendering a Markets tab against a server that refuses every
// request in it is exactly the failure the flag exists to prevent.
//
// ── Fail closed ────────────────────────────────────────────────────────────
//
// `false` until the server says otherwise, and `false` again on any error.
// Not knowing is not permission. The cost of being wrong in the other
// direction is showing data we are not licensed to show.
//
// The request is made ONCE per page load and shared; a dozen components
// asking is a dozen reads of one promise, not a dozen fetches.

import { useEffect, useState } from "react";
import { apiFetch } from "./api-fetch";

const ENDPOINT = "/api/market/providers";

export interface MarketVisibility {
  /** True only when the server said so. Never optimistic. */
  enabled: boolean;
  /** True until the first answer arrives. Callers render nothing meanwhile. */
  loading: boolean;
}

// Deliberately NOT cleared on error: one failed answer per page load is
// enough, and retrying would turn a hidden surface into a flickering one.
let inflight: Promise<boolean> | null = null;

async function fetchMarketDataEnabled(): Promise<boolean> {
  try {
    const res = await apiFetch(ENDPOINT, {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { marketDataEnabled?: boolean };
    // An older server bundle that pre-dates the flag omits the field. Absent
    // is not a yes — the same rule the whole module runs on.
    return body.marketDataEnabled === true;
  } catch {
    return false;
  }
}

/** Shared across all callers; the fetch happens at most once per page load. */
export function marketDataEnabledOnce(): Promise<boolean> {
  if (!inflight) inflight = fetchMarketDataEnabled();
  return inflight;
}

/** Test seam. Not used by application code. */
export function __resetMarketVisibilityForTesting(): void {
  inflight = null;
}

export function useMarketVisibility(): MarketVisibility {
  const [state, setState] = useState<MarketVisibility>({ enabled: false, loading: true });

  useEffect(() => {
    let cancelled = false;
    void marketDataEnabledOnce().then((enabled) => {
      if (!cancelled) setState({ enabled, loading: false });
    });
    return () => { cancelled = true; };
  }, []);

  return state;
}

/**
 * The common case: "may I render this market surface?". Collapses loading
 * into false so a caller cannot accidentally treat "don't know yet" as yes.
 */
export function useMarketDataEnabled(): boolean {
  return useMarketVisibility().enabled;
}
