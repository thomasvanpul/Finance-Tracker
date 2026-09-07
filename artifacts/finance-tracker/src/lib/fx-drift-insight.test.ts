// When the FX drift earns the slot, and — more often — when it does not.

import { describe, it, expect } from "vitest";
import { fxDriftInsight, FX_DRIFT_PRIORITY } from "./fx-drift-insight";
import type { FxDriftReport, FxDriftAccount } from "@workspace/api-client-react";

function account(over: Partial<FxDriftAccount> = {}): FxDriftAccount {
  return {
    accountId: 1,
    name: "Wise EUR",
    currency: "EUR",
    type: "cash",
    baselineDate: "2026-08-08",
    baselineBalance: 10_000,
    baselineRate: 0.85,
    currentBalance: 10_000,
    currentRate: 0.9,
    fxDeltaBase: 500,
    activityDeltaBase: 0,
    totalDeltaBase: 500,
    lastTransactionDate: "2026-07-30",
    daysSinceLastTransaction: 39,
    ...over,
  };
}

function report(over: Partial<FxDriftReport> = {}): FxDriftReport {
  return {
    status: "ok",
    baseCurrency: "GBP",
    periodFrom: "2026-08-08",
    periodTo: "2026-09-07",
    days: 30,
    dataAvailableSince: "2026-08-08",
    accounts: [account()],
    unmeasurableAccounts: 0,
    ...over,
  };
}

describe("fxDriftInsight — when it fires", () => {
  it("states the rate's share and drills to the single account carrying it", () => {
    const insight = fxDriftInsight(report())!;
    expect(insight).not.toBeNull();
    expect(insight.source).toBe("fx-drift");
    expect(insight.priority).toBe(FX_DRIFT_PRIORITY);
    expect(insight.headline).toContain("£500");
    expect(insight.headline).toContain("added");
    expect(insight.body).toContain("Wise EUR");
    expect(insight.drillHref).toBe("/accounts?account=1");
  });

  it("names a count and opens the list when several accounts moved", () => {
    const insight = fxDriftInsight(report({
      accounts: [
        account({ accountId: 1, name: "Wise EUR", fxDeltaBase: 500, totalDeltaBase: 500 }),
        account({ accountId: 2, name: "Maybank MYR", fxDeltaBase: 300, totalDeltaBase: 300 }),
      ],
    }))!;
    expect(insight.body).toContain("2 accounts");
    expect(insight.headline).toContain("£800");
    expect(insight.drillHref).toBe("/accounts");
  });

  it("says down when the rate moved against the holder", () => {
    const insight = fxDriftInsight(report({
      accounts: [account({ fxDeltaBase: -500, totalDeltaBase: -500 })],
    }))!;
    expect(insight.headline).toContain("£500");
    expect(insight.headline).toContain("took");
    expect(insight.headline).toContain("£500");
  });

  it("still fires when activity is present but the rate is the larger half", () => {
    const insight = fxDriftInsight(report({
      accounts: [account({ fxDeltaBase: 500, activityDeltaBase: 200, totalDeltaBase: 700 })],
    }));
    expect(insight).not.toBeNull();
  });

  it("says how many accounts have no baseline rather than implying zero drift", () => {
    const insight = fxDriftInsight(report({ unmeasurableAccounts: 2 }))!;
    expect(insight.body).toContain("+2 unmeasured");
  });

  it("ignores base-currency accounts when naming where the move sits", () => {
    const insight = fxDriftInsight(report({
      accounts: [
        account({ accountId: 5, name: "Monzo", currency: "GBP", fxDeltaBase: 0, activityDeltaBase: 40, totalDeltaBase: 40 }),
        account({ accountId: 1, name: "Wise EUR", fxDeltaBase: 500, totalDeltaBase: 500 }),
      ],
    }))!;
    expect(insight.body).toContain("Wise EUR");
    expect(insight.drillHref).toBe("/accounts?account=1");
  });
});

describe("fxDriftInsight — when it stays silent", () => {
  it("says nothing without a report", () => {
    expect(fxDriftInsight(undefined)).toBeNull();
  });

  it("says nothing when there is no baseline — no snapshot, no claim", () => {
    expect(fxDriftInsight(report({
      status: "insufficient", accounts: [], periodFrom: null, days: 0, unmeasurableAccounts: 4,
    }))).toBeNull();
  });

  it("says nothing about a few pounds of ordinary rate movement", () => {
    expect(fxDriftInsight(report({
      accounts: [account({ fxDeltaBase: 12, totalDeltaBase: 12 })],
    }))).toBeNull();
  });

  it("says nothing when the movement was mostly the user", () => {
    // £120 of rate against £900 of deposits — the movement IS theirs, and
    // "this movement is not yours" would be false.
    expect(fxDriftInsight(report({
      accounts: [account({ fxDeltaBase: 120, activityDeltaBase: 900, totalDeltaBase: 1_020 })],
    }))).toBeNull();
  });

  it("says nothing when every account is in the base currency", () => {
    expect(fxDriftInsight(report({
      accounts: [account({ accountId: 5, name: "Monzo", currency: "GBP", fxDeltaBase: 0, activityDeltaBase: 0, totalDeltaBase: 0 })],
    }))).toBeNull();
  });
  it("keeps the body inside the one line InsightSlot renders", () => {
    // InsightSlot nowraps and ellipsises the body; a long one truncated on
    // the rendered page. 45 characters is the measured budget at 13px.
    const insight = fxDriftInsight(report({ unmeasurableAccounts: 2 }));
    expect(insight).not.toBeNull();
    expect(insight!.body.length).toBeLessThanOrEqual(45);
  });
});
