// Pure helpers + constants for the Analytics page.
// Extracted from pages/analytics.tsx. No behaviour change.

export interface SpendingAnnotation {
  id: string;
  month: string; // "YYYY-MM"
  label: string;
}

export type Range = "30d" | "3m" | "6m" | "12m" | "all";

export const ANNOT_KEY = "ft-analytics-annotations";

export function loadAnnotations(): SpendingAnnotation[] {
  try { return JSON.parse(localStorage.getItem(ANNOT_KEY) ?? "[]") as SpendingAnnotation[]; }
  catch { return []; }
}
export function saveAnnotations(a: SpendingAnnotation[]): void {
  localStorage.setItem(ANNOT_KEY, JSON.stringify(a));
}

export const DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function getYYYYMM(d: string) { return d.slice(0, 7); }
export function localDate(d: string) { return new Date(d + "T12:00:00"); }
export function getDOW(d: string) { const w = localDate(d).getDay(); return w === 0 ? 6 : w - 1; }
export function getWeekOfMonth(d: string) { return Math.min(Math.floor((localDate(d).getDate() - 1) / 7), 4); }

export function monthsAgoStr(n: number): string {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function pctChange(prev: number, curr: number) {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return ((curr - prev) / prev) * 100;
}

export function cutoffDate(range: Range): Date {
  const now = new Date();
  if (range === "30d") { const d = new Date(now); d.setDate(d.getDate() - 30); return d; }
  if (range === "3m") { const d = new Date(now); d.setMonth(d.getMonth() - 3); return d; }
  if (range === "6m") { const d = new Date(now); d.setMonth(d.getMonth() - 6); return d; }
  if (range === "12m") { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d; }
  return new Date(0);
}
