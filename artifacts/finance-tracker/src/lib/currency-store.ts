import { useSyncExternalStore } from "react";

// Base-currency default is null, NOT "GBP". A hardcoded default is a
// visible lie on every cold start for any user whose base is not GBP:
// the first paint renders "£10,101.12" and only flips to "RM 10,101.12"
// after the settings query resolves. Null means "unknown yet"; money
// formatters return "—" when the base is unknown, per the app-wide "no
// fabricated number" rule.
//
// Second-and-later page loads hydrate synchronously from localStorage
// so the first render is already correct instead of dashed. Only the
// true first-ever visit shows "—" until the settings query resolves.
// That first-visit window is bounded by the sync effect in
// components/currency-sync.tsx which fires at App-level (not inside
// Layout — that was the defect from commit 8b639b6 where PhoneShell
// orphaned the only setter and every wrapped route rendered "—"
// permanently).
const LS_BASE_KEY = "nr-base-currency";

function readInitialBaseCurrency(): string | null {
  try {
    const v = localStorage.getItem(LS_BASE_KEY);
    return v && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

let baseCurrency: string | null = readInitialBaseCurrency();
let fxOverrides: Record<string, Record<string, number>> = {};

// Subscribers for useSyncExternalStore. When setBaseCurrency updates
// the module state, every subscribed component re-renders — which is
// the "component mounted with null, needs to see the resolved value
// once the sync effect fires" fix. Without this, formatBaseMoney(x)
// inside an already-rendered component keeps returning "—" until the
// component re-renders for some other reason.
const subscribers = new Set<() => void>();

function subscribeBaseCurrency(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

export function getBaseCurrency(): string | null {
  return baseCurrency;
}

export function setBaseCurrency(currency: string): void {
  if (baseCurrency === currency) return;
  baseCurrency = currency;
  try {
    localStorage.setItem(LS_BASE_KEY, currency);
  } catch {}
  for (const cb of subscribers) cb();
}

// React-aware getter. Components that call this hook re-render when
// baseCurrency changes. Use it wherever reactivity matters — typically
// at the tree root (see components/currency-sync.tsx which uses it in
// the Router to force subtree re-renders on store change).
// Non-reactive callers (formatBaseMoney and formatMoney utility
// functions in lib/utils.ts) continue to use getBaseCurrency() as a
// snapshot; they get the fresh value on the next render triggered by
// this hook's subscribers.
export function useBaseCurrency(): string | null {
  return useSyncExternalStore(subscribeBaseCurrency, getBaseCurrency, () => null);
}

export function loadFxOverrides(): void {
  try {
    const raw = localStorage.getItem("nr-fx-overrides");
    if (!raw) { fxOverrides = {}; return; }
    const parsed = JSON.parse(raw) as Record<string, Record<string, string>>;
    // Migrate old flat { USD: "1.27" } → { GBP: { USD: 1.27 } }
    const firstVal = Object.values(parsed)[0];
    if (typeof firstVal === "string") {
      fxOverrides = { GBP: Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, parseFloat(v as unknown as string)])) };
    } else {
      fxOverrides = Object.fromEntries(
        Object.entries(parsed).map(([base, pairs]) => [
          base,
          Object.fromEntries(Object.entries(pairs).map(([k, v]) => [k, parseFloat(v)])),
        ])
      );
    }
  } catch { fxOverrides = {}; }
}

export function getFxOverride(from: string, to: string): number | null {
  const rate = fxOverrides[from]?.[to];
  if (rate != null && isFinite(rate) && rate > 0) return rate;
  return null;
}

export function convertWithOverride(amount: number, from: string, to: string): number | null {
  const rate = getFxOverride(from, to);
  if (rate == null) return null;
  return amount * rate;
}
