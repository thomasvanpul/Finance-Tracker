import { describe, expect, it } from "vitest";
import { buildDailyBalances } from "./daily-balances";

// 10 Oct 2026, local time: days 1–10 have happened, 11–31 have not.
const NOW = new Date(2026, 9, 10, 9, 0, 0);
const balanceOn = (days: ReturnType<typeof buildDailyBalances>, day: number) =>
  days.find((d) => d.day === day)!.balance;

describe("buildDailyBalances", () => {
  it("rolls past days back from today's balance through this month's rows", () => {
    const days = buildDailyBalances(
      [{ date: "2026-10-05", baseEquivalent: -200, type: "expense" }],
      NOW,
      1_000,
    );
    expect(balanceOn(days, 4)).toBe(1_200);
    expect(balanceOn(days, 5)).toBe(1_000);
    expect(balanceOn(days, 10)).toBe(1_000);
    expect(days.filter((d) => d.future).map((d) => d.day)[0]).toBe(11);
  });

  it("carries the projection into the dotted days rather than holding today flat", () => {
    // Finding 96bde61ab7e5: the trough insight said "Overdrawn on 7 Oct"
    // while the projected bars for 7 Oct showed no dip at all.
    const days = buildDailyBalances([], NOW, 1_000, [
      { date: "2026-10-15", amount: -1_450 },
      { date: "2026-10-28", amount: 3_200 },
    ]);
    expect(balanceOn(days, 14)).toBe(1_000);
    expect(balanceOn(days, 15)).toBe(-450);
    expect(balanceOn(days, 27)).toBe(-450);
    expect(balanceOn(days, 28)).toBe(2_750);
  });

  it("leaves days that have happened to the ledger, and ignores other months", () => {
    // Today's bar is solid — it is what the ledger says, not a forecast — so
    // a projected occurrence dated today or earlier must not move it, and
    // one past month-end belongs to a chart this one is not.
    const days = buildDailyBalances([], NOW, 1_000, [
      { date: "2026-10-10", amount: -300 },
      { date: "2026-11-02", amount: -300 },
    ]);
    expect(days.every((d) => d.balance === 1_000)).toBe(true);
  });
});
