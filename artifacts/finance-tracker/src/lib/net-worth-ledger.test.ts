// /net-worth draws its chart and snapshot table from GET /net-worth/history
// merged with the manual entries the user typed into ft-nw-history (finding
// b6b740eade39, third reader). The server stores no manual entries or notes;
// the key also holds machine captures the page should no longer draw.

import { describe, expect, it } from "vitest";
import { ledgerFromHistory, manualEntries } from "./net-worth-ledger";

const point = (date: string, o: Partial<{ netWorth: number; assets: number; portfolio: number; liabilities: number; owingNet: number; partial: boolean }> = {}) => ({
  date, netWorth: 0, assets: 0, portfolio: 0, liabilities: 0, owingNet: 0, partial: false, ...o,
});

describe("manualEntries", () => {
  it("keeps entries the user typed, with or without a note", () => {
    const raw = [
      { date: "2026-01-01", totalAssets: 100, totalLiabilities: 10, netWorth: 90, note: "bonus" },
      { date: "2026-02-01", totalAssets: 200, totalLiabilities: 0, netWorth: 200 },
    ];
    expect(manualEntries(raw)).toEqual(raw);
  });

  it("drops this page's own auto snapshots, which the server now captures", () => {
    expect(manualEntries([{ date: "2026-01-01", totalAssets: 1, totalLiabilities: 0, netWorth: 1, note: "auto" }])).toEqual([]);
  });

  it("drops the {date, netWorth, cash, portfolio} captures other screens wrote", () => {
    // These have no totalAssets, so the table drew an empty Assets cell for them.
    expect(manualEntries([{ date: "2026-01-01", netWorth: 5, cash: 3, portfolio: 2 }])).toEqual([]);
  });

  it("is empty for anything that is not an array", () => {
    expect(manualEntries(null)).toEqual([]);
    expect(manualEntries({ date: "x" })).toEqual([]);
  });
});

describe("ledgerFromHistory", () => {
  it("maps a captured day so assets minus liabilities is its net worth", () => {
    const [e] = ledgerFromHistory([point("2026-10-01", { netWorth: 1250, assets: 1000, portfolio: 500, liabilities: 300, owingNet: 50 })], []);
    expect(e).toEqual({ date: "2026-10-01", totalAssets: 1550, totalLiabilities: 300, netWorth: 1250, source: "captured", partial: false });
    expect(e.totalAssets - e.totalLiabilities).toBe(e.netWorth);
  });

  it("counts a net amount owed by the user as a liability", () => {
    const [e] = ledgerFromHistory([point("2026-10-01", { netWorth: 700, assets: 1000, liabilities: 200, owingNet: -100 })], []);
    expect(e.totalAssets).toBe(1000);
    expect(e.totalLiabilities).toBe(300);
  });

  it("interleaves manual and captured days, oldest first", () => {
    const out = ledgerFromHistory(
      [point("2026-10-02", { netWorth: 20, assets: 20 })],
      [{ date: "2026-01-15", totalAssets: 10, totalLiabilities: 0, netWorth: 10, note: "pre-app" }],
    );
    expect(out.map((e) => [e.date, e.source])).toEqual([["2026-01-15", "manual"], ["2026-10-02", "captured"]]);
    expect(out[0].note).toBe("pre-app");
  });

  it("lets a manual entry stand over the capture for the same day", () => {
    // The user recorded that day on purpose; the capture is still there once it is deleted.
    const out = ledgerFromHistory(
      [point("2026-10-02", { netWorth: 20, assets: 20 })],
      [{ date: "2026-10-02", totalAssets: 99, totalLiabilities: 9, netWorth: 90, note: "after bonus" }],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ netWorth: 90, source: "manual", note: "after bonus" });
  });

  it("carries a partial capture through", () => {
    expect(ledgerFromHistory([point("2026-10-01", { partial: true })], [])[0].partial).toBe(true);
  });

  it("drops a point with no usable date", () => {
    expect(ledgerFromHistory([point("nope")], [])).toEqual([]);
  });
});
