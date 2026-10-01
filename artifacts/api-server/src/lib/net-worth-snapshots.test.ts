// Daily net-worth capture and the history read. The DB is mocked; the
// migration itself was checked up and down against the dev branch.

import { describe, it, expect, vi, beforeEach } from "vitest";

const inserts: { values: Record<string, unknown>; conflictTarget: unknown; mode: string }[] = [];
let insertFails = false;
let selected: Record<string, unknown>[] = [];

vi.mock("@workspace/db", () => ({
  db: {
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoNothing: (opts: { target: unknown }) => {
          if (insertFails) return Promise.reject(new Error("db down"));
          inserts.push({ values, conflictTarget: opts.target, mode: "nothing" });
          return Promise.resolve();
        },
      }),
    }),
    select: () => {
      const chain: Record<string, unknown> = {};
      chain.from = () => chain;
      chain.where = () => chain;
      chain.orderBy = async () => selected;
      return chain;
    },
  },
  netWorthSnapshotsTable: {
    userId: { name: "user_id" },
    date: { name: "date" },
    baseCurrency: { name: "base_currency" },
  },
}));

vi.mock("./logger", () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const { captureNetWorthSnapshot, readNetWorthHistory } = await import("./net-worth-snapshots");

const terms = { totalCash: 1000, portfolioValueBase: 500.125, totalOwedToMe: 40, totalIOwe: 10, totalLiabilities: 200 };

beforeEach(() => {
  inserts.length = 0;
  insertFails = false;
  selected = [];
});

describe("captureNetWorthSnapshot", () => {
  it("records computeNetWorth's four terms and its result, write-once per user and day", async () => {
    await captureNetWorthSnapshot("user-a", { terms, netWorth: 1330.125, baseCurrency: "GBP", partial: false, now: new Date(2026, 9, 1, 9) });
    expect(inserts).toHaveLength(1);
    expect(inserts[0].values).toEqual({
      userId: "user-a",
      date: "2026-10-01",
      baseCurrency: "GBP",
      assets: "1000",
      portfolio: "500.125",
      liabilities: "200",
      owingNet: "30",
      netWorth: "1330.125",
      partial: false,
    });
    expect(inserts[0].conflictTarget).toEqual([{ name: "user_id" }, { name: "date" }]);
  });

  it("never throws: the dashboard read must not fail on a snapshot write", async () => {
    insertFails = true;
    await expect(
      captureNetWorthSnapshot("user-a", { terms, netWorth: 1330.125, baseCurrency: "GBP", partial: true }),
    ).resolves.toBeUndefined();
  });
});

describe("readNetWorthHistory", () => {
  it("returns points in the current base currency and counts the days in another", async () => {
    selected = [
      { date: "2026-09-29", baseCurrency: "USD", assets: "1", portfolio: "0", liabilities: "0", owingNet: "0", netWorth: "1", partial: false },
      { date: "2026-09-30", baseCurrency: "GBP", assets: "1000.0000", portfolio: "500.1250", liabilities: "200.0000", owingNet: "30.0000", netWorth: "1330.1250", partial: false },
      { date: "2026-10-01", baseCurrency: "GBP", assets: "900", portfolio: "500", liabilities: "200", owingNet: "0", netWorth: "1200", partial: true },
    ];
    const out = await readNetWorthHistory("user-a", "GBP", 90);
    expect(out).toEqual({
      baseCurrency: "GBP",
      dataAvailableSince: "2026-09-30",
      daysInOtherCurrency: 1,
      points: [
        { date: "2026-09-30", netWorth: 1330.13, assets: 1000, portfolio: 500.13, liabilities: 200, owingNet: 30, partial: false },
        { date: "2026-10-01", netWorth: 1200, assets: 900, portfolio: 500, liabilities: 200, owingNet: 0, partial: true },
      ],
    });
  });

  it("says plainly when nothing has been captured yet", async () => {
    expect(await readNetWorthHistory("user-a", "GBP", 90)).toEqual({
      baseCurrency: "GBP", dataAvailableSince: null, daysInOtherCurrency: 0, points: [],
    });
  });
});
