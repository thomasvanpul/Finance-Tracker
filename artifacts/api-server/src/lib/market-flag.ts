// One switch for every market-data surface in the product.
//
// ── Why it exists ──────────────────────────────────────────────────────────
//
// Decided 2026-09-19, before the volunteer test round. Numeris cannot show
// market data to end users: Alpaca's agreement forbids display to end users
// in writing, index levels were already refused on the same grounds
// (lib/market-classifier.ts, HTTP 451), and Yahoo is an unlicensed scrape
// rather than a redistribution right. That covers live quotes, and it covers
// the end-of-day closes that value a holding just as much — a price on a
// screen is a price on a screen, whatever its age.
//
// So the surface goes, and the code stays. This is a switch, not a deletion,
// because the decision is a licensing one and licensing changes.
//
// ── What is INSIDE the flag ────────────────────────────────────────────────
//
//   quotes · prices · EOD closes that value holdings · history · detail ·
//   options chains · news · the live SSE tick stream · provider health ·
//   the Alpaca websocket connection at boot
//
// ── What is OUTSIDE it, deliberately ───────────────────────────────────────
//
//   FX rates. They come from the ECB via Frankfurter (keyless, no display
//   restriction) with Yahoo only as a fallback pair lookup, and every
//   non-market money figure in the app depends on them: the whole design
//   shows a native currency first and a converted value second. Turning FX
//   off would not remove a market surface, it would break every balance in
//   a multi-currency account. Confirmed with Thomas, 19 Sep 2026.
//
//   Cost basis. What the user typed in is the user's own data and is shown
//   whether or not this flag is on. That is what a holding falls back to.
//
// ── Default OFF ────────────────────────────────────────────────────────────
//
// Unset means off, exactly like ENABLE_DEV_ROUTES in routes/dev.ts, and for
// the stronger reason: the failure mode of guessing wrong here is showing a
// user data we are not licensed to show. A deployment that never sets the
// variable must land in the safe state, not the permissive one. The repo has
// already shipped a check keyed to `NODE_ENV !== "production"` on a platform
// that never set NODE_ENV, and it silently disabled itself.

type Env = Record<string, string | undefined>;

export const MARKET_DATA_FLAG = "ENABLE_MARKET_DATA";

export type MarketDataDecision =
  | { enabled: true }
  | { enabled: false; reason: string };

// One wording, used by the decision, the error and the router refusal. Kept
// module-local so the union stays the only way to ask whether it applies.
const OFF_REASON = `Market data is not served by this deployment (${MARKET_DATA_FLAG} is not set).`;

export function decideMarketData(env: Env = process.env): MarketDataDecision {
  if (env[MARKET_DATA_FLAG] === "1") return { enabled: true };
  return { enabled: false, reason: OFF_REASON };
}

export function isMarketDataEnabled(env: Env = process.env): boolean {
  return decideMarketData(env).enabled;
}

// The wording the API answers with, and the code a client keys on. Public
// and deliberately boring: it names a deployment decision, not an outage,
// so nobody debugs a provider that was never called.
export const MARKET_DATA_OFF_CODE = "MARKET_DATA_OFF";

/**
 * Thrown by every quote-fetching function in lib/market.ts when the flag is
 * off. Callers that must keep working without prices (the dashboard, the
 * investments list) do not catch this — they ask the flag themselves and
 * skip the call, so a price is absent rather than an error. Anything that
 * reaches this throw is a caller that forgot, and it should be loud.
 */
export class MarketDataOffError extends Error {
  readonly code = MARKET_DATA_OFF_CODE;
  constructor(reason?: string) {
    super(reason ?? OFF_REASON);
    this.name = "MarketDataOffError";
  }
}

export function assertMarketDataEnabled(): void {
  const decision = decideMarketData();
  if (!decision.enabled) throw new MarketDataOffError(decision.reason);
}

// Router-level refusal, shared by routes/market.ts and routes/market-live.ts.
//
// 503 with a reason, not 404: the route exists and will work again the day
// the flag is set, and an operator reading the response should learn which
// variable decides it rather than hunt a routing bug. Same reasoning as the
// deliberately-403-not-404 refusal in routes/dev.ts.
//
// Typed structurally rather than against express's Request/Response so this
// module stays importable by tests that do not boot the app.
export function marketDataOnly(
  _req: unknown,
  res: { status: (code: number) => { json: (body: unknown) => unknown } },
  next: () => void,
): void {
  const decision = decideMarketData();
  if (decision.enabled) return next();
  res.status(503).json({ error: decision.reason, code: MARKET_DATA_OFF_CODE });
}
