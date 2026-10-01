import type { NetWorthPoint } from "@workspace/api-client-react";

// One captured day as the dashboard net-worth widget draws it. `cash` is the
// gross accounts total (the snapshot's `assets`, which is the dashboard's
// totalCash), `partial` marks a day whose figure left something out.
export type NetWorthHistoryEntry = {
  date: string;
  netWorth: number;
  cash: number;
  portfolio: number;
  partial: boolean;
};

// Points as GET /net-worth/history returns them, oldest first. A point with no
// usable date is dropped: a point with no x is not a point.
export function historyFromPoints(points: NetWorthPoint[] | undefined): NetWorthHistoryEntry[] {
  return (points ?? [])
    .filter((p) => typeof p.date === "string" && !Number.isNaN(Date.parse(p.date)))
    .map((p) => ({ date: p.date, netWorth: p.netWorth, cash: p.assets, portfolio: p.portfolio, partial: p.partial }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// The day before a YYYY-MM-DD local date, by calendar.
function dayBefore(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const prev = new Date(y, m - 1, d - 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${prev.getFullYear()}-${pad(prev.getMonth() + 1)}-${pad(prev.getDate())}`;
}

// Today's figure minus yesterday's, or null unless both days were captured.
// The last two entries are only "today" and "yesterday" on a user who opened
// the dashboard on both; anything else would label a multi-day move as today's.
export function todayDelta(history: NetWorthHistoryEntry[], today: string): number | null {
  const last = history.at(-1);
  const prev = history.at(-2);
  if (!last || !prev || last.date !== today || prev.date !== dayBefore(today)) return null;
  return last.netWorth - prev.netWorth;
}
