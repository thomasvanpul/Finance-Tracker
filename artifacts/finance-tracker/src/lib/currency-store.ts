// Base-currency default is null, NOT "GBP". A hardcoded default is a
// visible lie on every cold start for any user whose base is not GBP:
// the first paint renders "£10,101.12" and only flips to "RM 10,101.12"
// after the settings query resolves. On cellular in a WKWebView that
// window is however long the request takes — this is the same class of
// defect the whole rename commit is closing. Null means "unknown yet";
// money formatters return "—" when the base is unknown, per the app-
// wide "no fabricated number" rule.
let baseCurrency: string | null = null;
let fxOverrides: Record<string, Record<string, number>> = {};

export function getBaseCurrency(): string | null {
  return baseCurrency;
}

export function setBaseCurrency(currency: string): void {
  baseCurrency = currency;
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
