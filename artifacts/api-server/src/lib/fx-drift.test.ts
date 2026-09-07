// FX-only drift. Pure arithmetic — no DB, no FX provider.

import { describe, it, expect } from "vitest";
import { computeFxDrift, daysBetween, type FxDriftInput } from "./fx-drift";

const TODAY = "2026-09-07";

function input(over: Partial<FxDriftInput> = {}): FxDriftInput {
  return {
    accounts: [],
    snapshots: [],
    activity: [],
    today: TODAY,
    baseCurrency: "GBP",
    ...over,
  };
}

/** A EUR account holding 10,000, rate 0.85 → 0.90, untouched. */
function eurUntouched(over: Partial<FxDriftInput> = {}): FxDriftInput {
  return input({
    accounts: [{ id: 1, name: "Revolut EUR", currency: "EUR", type: "cash", balance: 10_000, currentRate: 0.9 }],
    snapshots: [{ accountId: 1, date: "2026-08-08", balance: 10_000, nativeToBaseRate: 0.85 }],
    activity: [{ accountId: 1, lastTransactionDate: "2026-07-30" }],
    ...over,
  });
}

describe("computeFxDrift — the decomposition", () => {
  it("attributes the whole base change to FX when the balance never moved", () => {
    const report = computeFxDrift(eurUntouched());
    expect(report.status).toBe("ok");
    expect(report.accounts).toHaveLength(1);
    const a = report.accounts[0]!;
    // 10,000 × (0.90 − 0.85) = 500
    expect(a.fxDeltaBase).toBeCloseTo(500, 6);
    expect(a.activityDeltaBase).toBe(0);
    expect(a.totalDeltaBase).toBeCloseTo(500, 6);
  });

  it("splits exactly: fx + activity always equals base_now − base_then", () => {
    // Balance moved as well as the rate, so both terms are non-zero. This is
    // the property that makes the split honest: whatever the caller does with
    // the two numbers, they must still add up to the movement on the screen.
    const report = computeFxDrift(eurUntouched({
      accounts: [{ id: 1, name: "Revolut EUR", currency: "EUR", type: "cash", balance: 12_500, currentRate: 0.9 }],
    }));
    const a = report.accounts[0]!;
    const baseThen = 10_000 * 0.85;
    const baseNow = 12_500 * 0.9;
    expect(a.fxDeltaBase + a.activityDeltaBase).toBeCloseTo(baseNow - baseThen, 6);
    expect(a.totalDeltaBase).toBeCloseTo(baseNow - baseThen, 6);
    expect(a.fxDeltaBase).toBeCloseTo(500, 6);          // 10,000 × 0.05
    expect(a.activityDeltaBase).toBeCloseTo(2_250, 6);  // 2,500 × 0.90
  });

  it("reports a negative FX component when the rate moved against the holder", () => {
    const report = computeFxDrift(eurUntouched({
      accounts: [{ id: 1, name: "Revolut EUR", currency: "EUR", type: "cash", balance: 10_000, currentRate: 0.8 }],
    }));
    expect(report.accounts[0]!.fxDeltaBase).toBeCloseTo(-500, 6);
  });

  it("gives a base-currency account no FX component at all", () => {
    const report = computeFxDrift(input({
      accounts: [{ id: 2, name: "Monzo", currency: "GBP", type: "cash", balance: 3_200, currentRate: 1 }],
      snapshots: [{ accountId: 2, date: "2026-08-08", balance: 3_000, nativeToBaseRate: 1 }],
      activity: [{ accountId: 2, lastTransactionDate: "2026-09-06" }],
    }));
    const a = report.accounts[0]!;
    expect(a.fxDeltaBase).toBe(0);
    expect(a.activityDeltaBase).toBeCloseTo(200, 6);
  });
});

describe("computeFxDrift — no snapshot, no claim", () => {
  it("excludes an account with no snapshot rather than assuming today's rate", () => {
    const report = computeFxDrift(input({
      accounts: [{ id: 1, name: "Wise USD", currency: "USD", type: "cash", balance: 5_000, currentRate: 0.78 }],
      snapshots: [],
      activity: [{ accountId: 1, lastTransactionDate: "2026-08-01" }],
    }));
    expect(report.accounts).toEqual([]);
    expect(report.unmeasurableAccounts).toBe(1);
    expect(report.status).toBe("insufficient");
    expect(report.periodFrom).toBeNull();
    expect(report.days).toBe(0);
  });

  it("excludes an account whose snapshot carries no rate — never back-applies today's", () => {
    // This is the regression that matters. Re-deriving the baseline rate from
    // today's would make fxDeltaBase exactly 0 and a real drift would read as
    // "no drift" — the one wrong answer the endpoint must never give.
    const report = computeFxDrift(input({
      accounts: [{ id: 1, name: "Wise USD", currency: "USD", type: "cash", balance: 5_000, currentRate: 0.78 }],
      snapshots: [{ accountId: 1, date: "2026-08-08", balance: 5_000, nativeToBaseRate: null }],
      activity: [{ accountId: 1, lastTransactionDate: "2026-08-01" }],
    }));
    expect(report.accounts).toEqual([]);
    expect(report.unmeasurableAccounts).toBe(1);
  });

  it("excludes an account whose currency has no rate today", () => {
    const report = computeFxDrift(input({
      accounts: [{ id: 1, name: "Maybank MYR", currency: "MYR", type: "cash", balance: 8_000, currentRate: null }],
      snapshots: [{ accountId: 1, date: "2026-08-08", balance: 8_000, nativeToBaseRate: 0.17 }],
      activity: [{ accountId: 1, lastTransactionDate: "2026-08-01" }],
    }));
    expect(report.accounts).toEqual([]);
    expect(report.unmeasurableAccounts).toBe(1);
  });

  it("reports the measurable accounts and counts the rest, rather than failing whole", () => {
    const report = computeFxDrift(input({
      accounts: [
        { id: 1, name: "Revolut EUR", currency: "EUR", type: "cash", balance: 10_000, currentRate: 0.9 },
        { id: 2, name: "Maybank MYR", currency: "MYR", type: "cash", balance: 8_000, currentRate: null },
      ],
      snapshots: [
        { accountId: 1, date: "2026-08-08", balance: 10_000, nativeToBaseRate: 0.85 },
        { accountId: 2, date: "2026-08-08", balance: 8_000, nativeToBaseRate: 0.17 },
      ],
      activity: [],
    }));
    expect(report.status).toBe("ok");
    expect(report.accounts.map(a => a.accountId)).toEqual([1]);
    expect(report.unmeasurableAccounts).toBe(1);
    // dataAvailableSince still reports what is held, so the UI can say what
    // is missing rather than implying the drift is zero.
    expect(report.dataAvailableSince).toBe("2026-08-08");
  });
});

describe("computeFxDrift — the baseline", () => {
  it("takes the earliest snapshot before today, not the latest", () => {
    const report = computeFxDrift(eurUntouched({
      snapshots: [
        { accountId: 1, date: "2026-09-01", balance: 10_000, nativeToBaseRate: 0.89 },
        { accountId: 1, date: "2026-08-08", balance: 10_000, nativeToBaseRate: 0.85 },
        { accountId: 1, date: "2026-08-20", balance: 10_000, nativeToBaseRate: 0.87 },
      ],
    }));
    const a = report.accounts[0]!;
    expect(a.baselineDate).toBe("2026-08-08");
    expect(a.baselineRate).toBe(0.85);
    expect(report.periodFrom).toBe("2026-08-08");
    expect(report.days).toBe(30);
  });

  it("ignores a snapshot captured today — the day is not over", () => {
    const report = computeFxDrift(eurUntouched({
      snapshots: [{ accountId: 1, date: TODAY, balance: 10_000, nativeToBaseRate: 0.9 }],
    }));
    expect(report.accounts).toEqual([]);
    expect(report.dataAvailableSince).toBeNull();
  });
});

describe("computeFxDrift — the report", () => {
  it("orders accounts by the size of the FX move, largest first", () => {
    const report = computeFxDrift(input({
      accounts: [
        { id: 1, name: "Small EUR", currency: "EUR", type: "cash", balance: 1_000, currentRate: 0.9 },
        { id: 2, name: "Big USD", currency: "USD", type: "cash", balance: 50_000, currentRate: 0.78 },
        { id: 3, name: "Falling CHF", currency: "CHF", type: "cash", balance: 20_000, currentRate: 0.85 },
      ],
      snapshots: [
        { accountId: 1, date: "2026-08-08", balance: 1_000, nativeToBaseRate: 0.85 },   // +50
        { accountId: 2, date: "2026-08-08", balance: 50_000, nativeToBaseRate: 0.775 }, // +250
        { accountId: 3, date: "2026-08-08", balance: 20_000, nativeToBaseRate: 0.9 },   // −1000
      ],
      activity: [],
    }));
    // Ranked on magnitude, so a large loss outranks a small gain.
    expect(report.accounts.map(a => a.accountId)).toEqual([3, 2, 1]);
  });

  it("includes non-cash accounts, unlike the reconciliation gap", () => {
    const report = computeFxDrift(input({
      accounts: [{ id: 9, name: "Lisbon flat", currency: "EUR", type: "property", balance: 240_000, currentRate: 0.9 }],
      snapshots: [{ accountId: 9, date: "2026-08-08", balance: 240_000, nativeToBaseRate: 0.85 }],
      activity: [{ accountId: 9, lastTransactionDate: null }],
    }));
    expect(report.accounts).toHaveLength(1);
    expect(report.accounts[0]!.type).toBe("property");
    expect(report.accounts[0]!.fxDeltaBase).toBeCloseTo(12_000, 6);
  });

  it("carries how long the account has been untouched, and null when never", () => {
    const report = computeFxDrift(eurUntouched());
    expect(report.accounts[0]!.lastTransactionDate).toBe("2026-07-30");
    expect(report.accounts[0]!.daysSinceLastTransaction).toBe(39);

    const never = computeFxDrift(eurUntouched({ activity: [{ accountId: 1, lastTransactionDate: null }] }));
    expect(never.accounts[0]!.daysSinceLastTransaction).toBeNull();

    const unknown = computeFxDrift(eurUntouched({ activity: [] }));
    expect(unknown.accounts[0]!.lastTransactionDate).toBeNull();
    expect(unknown.accounts[0]!.daysSinceLastTransaction).toBeNull();
  });

  it("is insufficient, not ok-with-nothing, when there are no accounts at all", () => {
    const report = computeFxDrift(input());
    expect(report.status).toBe("insufficient");
    expect(report.unmeasurableAccounts).toBe(0);
    expect(report.dataAvailableSince).toBeNull();
    expect(report.periodTo).toBe(TODAY);
  });
});

describe("daysBetween", () => {
  it("counts whole days and survives a DST boundary", () => {
    expect(daysBetween("2026-09-01", "2026-09-07")).toBe(6);
    expect(daysBetween("2026-10-20", "2026-11-03")).toBe(14); // BST → GMT
    expect(daysBetween("2026-09-07", "2026-09-07")).toBe(0);
  });
});
