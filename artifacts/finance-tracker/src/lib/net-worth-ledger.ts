import type { NetWorthPoint } from "@workspace/api-client-react";

// One row of the /net-worth page: a day the dashboard captured (GET
// /net-worth/history) or one the user recorded by hand (ft-nw-history, which
// the server does not store). totalAssets - totalLiabilities === netWorth.
export type LedgerEntry = {
  date: string;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  note?: string;
  source: "captured" | "manual";
  partial: boolean;
};

export type ManualEntry = {
  date: string;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
  note?: string;
};

// The entries in ft-nw-history the user typed. The key also holds this page's
// own `note: "auto"` snapshots and the {date, netWorth, cash, portfolio}
// captures the dashboard widget and /accounts wrote, each under the net-worth
// definition of its day; the server capture replaces both.
export function manualEntries(raw: unknown): ManualEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is ManualEntry =>
    e != null &&
    typeof e.date === "string" &&
    typeof e.totalAssets === "number" &&
    typeof e.totalLiabilities === "number" &&
    typeof e.netWorth === "number" &&
    e.note !== "auto");
}

// Captured days and manual entries, oldest first. A manual entry stands over
// the capture for its day: the user recorded that day on purpose, and deleting
// the entry shows the capture again.
export function ledgerFromHistory(points: NetWorthPoint[] | undefined, manual: ManualEntry[]): LedgerEntry[] {
  const byDate = new Map<string, LedgerEntry>();
  for (const p of points ?? []) {
    if (typeof p.date !== "string" || Number.isNaN(Date.parse(p.date))) continue;
    byDate.set(p.date, {
      date: p.date,
      totalAssets: p.assets + p.portfolio + Math.max(p.owingNet, 0),
      totalLiabilities: p.liabilities + Math.max(-p.owingNet, 0),
      netWorth: p.netWorth,
      source: "captured",
      partial: p.partial,
    });
  }
  for (const m of manual) {
    byDate.set(m.date, { ...m, source: "manual", partial: false });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
