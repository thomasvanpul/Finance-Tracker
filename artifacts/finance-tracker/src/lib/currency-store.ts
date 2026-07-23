let baseCurrency = "GBP";
let fxOverrides: Record<string, Record<string, number>> = {};

export function getBaseCurrency(): string {
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
