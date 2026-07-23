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
  return formatCurrency(value, getBaseCurrency());
}

export function formatNative(value: number, currency: string): string {
  return (
    new Intl.NumberFormat(getNumberLocale(), {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value) +
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
