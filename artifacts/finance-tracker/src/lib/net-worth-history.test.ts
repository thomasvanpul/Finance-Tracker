// The dashboard net-worth widget reads its history from GET /net-worth/history
// (finding b6b740eade39), not from the ft-nw-history localStorage key, which
// three screens wrote in two shapes and which recorded each day's figure under
// whatever net-worth definition the app had that day.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { historyFromPoints, todayDelta } from "./net-worth-history";

const point = (date: string, netWorth: number, partial = false) => ({
  date, netWorth, assets: netWorth + 100, portfolio: 50, liabilities: 150, owingNet: 0, partial,
});

describe("historyFromPoints", () => {
  it("maps each captured day to the widget's entry, oldest first", () => {
    const out = historyFromPoints([point("2026-10-02", 900), point("2026-10-01", 800)]);
    expect(out).toEqual([
      { date: "2026-10-01", netWorth: 800, cash: 900, portfolio: 50, partial: false },
      { date: "2026-10-02", netWorth: 900, cash: 1000, portfolio: 50, partial: false },
    ]);
  });

  it("drops a point with no usable date rather than placing it", () => {
    expect(historyFromPoints([point("not a date", 1), point("2026-10-01", 2)]).map((e) => e.date))
      .toEqual(["2026-10-01"]);
  });

  it("is empty with no points", () => {
    expect(historyFromPoints(undefined)).toEqual([]);
  });
});

describe("todayDelta", () => {
  const h = historyFromPoints([point("2026-09-30", 1000), point("2026-10-01", 1250)]);

  it("is today's figure minus yesterday's", () => {
    expect(todayDelta(h, "2026-10-01")).toBe(250);
  });

  it("is null when the newest captured day is not today", () => {
    expect(todayDelta(h, "2026-10-02")).toBeNull();
  });

  it("is null when the day before today was not captured", () => {
    const gap = historyFromPoints([point("2026-09-28", 1000), point("2026-10-01", 1250)]);
    expect(todayDelta(gap, "2026-10-01")).toBeNull();
  });

  it("crosses a month boundary by calendar, not by string", () => {
    const edge = historyFromPoints([point("2026-09-30", 10), point("2026-10-01", 15)]);
    expect(todayDelta(edge, "2026-10-01")).toBe(5);
  });
});

describe("net-worth widget source", () => {
  const src = readFileSync(
    path.resolve(__dirname, "../components/widgets/net-worth.tsx"), "utf8");

  it("reads the server history", () => {
    expect(src).toContain("useGetNetWorthHistory");
    expect(src).toContain("historyFromPoints");
  });

  it("no longer keeps its own copy in localStorage", () => {
    expect(src).not.toContain("localStorage");
    expect(src).not.toContain("ft-nw-history");
  });
});
