import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { getBaseCurrency } from "./currency-store";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function getNumberLocale(): string {
  try {
    const fmt = localStorage.getItem("nr-number-format") ?? "1,234.56";
    if (fmt === "1.234,56") return "de-DE";
    if (fmt === "1 234.56") return "fr-FR";
    return "en-GB";
  } catch { return "en-GB"; }
}

function getDateFormat(): string {
  try { return localStorage.getItem("nr-date-format") ?? "DD/MM/YYYY"; } catch { return "DD/MM/YYYY"; }
}

export function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat(getNumberLocale(), {
    style: "currency",
    currency,
  }).format(value);
}

export function formatGbp(value: number): string {
  return formatCurrency(Object.is(value, -0) ? 0 : value, getBaseCurrency());
}

// Render a nullable base-currency figure. Null (FX unavailable) becomes
// "—" per the app-wide "no fabricated number" rule. Never fall through
// to formatGbp(x ?? 0), which reintroduces the fabricated-zero defect
// that this whole thread of commits is removing. Consumers with access
// to the native amount should prefer showing that alone rather than
// this dash — a row that reads "RM 4,120.00 · —" is honest, "£0" is not.
export function formatGbpOrDash(value: number | null | undefined): string {
  if (value == null) return "—";
  return formatGbp(value);
}

// Sum a nullable series of base-currency figures, returning the total
// and a count of items excluded because their FX conversion was missing.
// Callers with a non-zero `unconvertible` count MUST caveat the total —
// a "net worth" that silently omits an account is its own kind of lie.
export function sumConvertible<T>(
  list: readonly T[],
  get: (item: T) => number | null | undefined,
): { total: number; unconvertible: number } {
  let total = 0;
  let unconvertible = 0;
  for (const item of list) {
    const v = get(item);
    if (v == null) unconvertible += 1;
    else total += v;
  }
  return { total, unconvertible };
}

export function formatNative(value: number, currency: string): string {
  const v = Object.is(value, -0) ? 0 : value;
  return (
    new Intl.NumberFormat(getNumberLocale(), {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v) +
    " " +
    currency
  );
}

export function formatDate(dateString: string): string {
  if (!dateString) return "";
  const date = new Date(dateString + (dateString.length === 10 ? "T00:00:00" : ""));
  const fmt = getDateFormat();
  if (fmt === "YYYY-MM-DD") return dateString.slice(0, 10);
  if (fmt === "MM/DD/YYYY") {
    return new Intl.DateTimeFormat("en-US", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
  }
  if (fmt === "D MMM YYYY") {
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(date);
  }
  // DD/MM/YYYY default
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
}
