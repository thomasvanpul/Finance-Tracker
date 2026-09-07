// Wording and drill targets. The arithmetic is tested on the server
// (api-server/src/lib/change-attribution.test.ts) — what can go wrong here is
// a label that misnames a part, a figure with no way into its rows, or a
// surface that quietly renders zero when nothing was measured.

import { describe, it, expect } from "vitest";
import { attributionView, shortDate, type AttributionView } from "./change-attribution-view";
import type { ChangeAttributionReport } from "@workspace/api-client-react";

/** Narrow to the measured branch, failing loudly if it is not that one. */
function ok(view: AttributionView | null): Extract<AttributionView, { status: "ok" }> {
  if (view == null || view.status !== "ok") throw new Error(`expected a measured view, got ${JSON.stringify(view)}`);
  return view;
}

function report(over: Partial<ChangeAttributionReport> = {}): ChangeAttributionReport {
  return {
    status: "ok",
    baseCurrency: "GBP",
    periodRule: "month-to-date",
    periodFrom: "2026-09-01",
    periodTo: "2026-09-07",
    days: 6,
    dataAvailableSince: "2026-08-08",
    totalDeltaBase: -159.45,
    parts: [],
    residualBase: 0,
    balances: true,
    measuredAccounts: 5,
    unmeasurableAccounts: 0,
    ...over,
  } as ChangeAttributionReport;
}

const SPEND = { kind: "spend" as const, amountBase: -27.04, transactions: 2, accounts: [
  { accountId: 1, name: "Monzo", currency: "GBP", amountBase: -27.04, fromRate: null, toRate: null },
] };
const RATE = { kind: "rate" as const, amountBase: -90, transactions: null, accounts: [
  { accountId: 4, name: "Maybank", currency: "MYR", amountBase: -90, fromRate: 0.185, toRate: 0.18 },
] };
const UNEXPLAINED = { kind: "unexplained" as const, amountBase: -42.41, transactions: null, accounts: [
  { accountId: 1, name: "Monzo", currency: "GBP", amountBase: -42.41, fromRate: null, toRate: null },
] };

describe("attributionView — the three lines", () => {
  it("names each part and states the evidence for it", () => {
    const view = ok(attributionView(report({ parts: [SPEND, RATE, UNEXPLAINED] })));
    expect(view.totalBase).toBe(-159.45);
    expect(view.windowLabel).toBe("since 1 Sep");
    expect(view.rows.map((r) => `${r.label} | ${r.detail}`)).toEqual([
      "you spent | 2 transactions",
      // The app quotes rates as units-per-base everywhere (accounts.tsx
      // FxRateCell), so a share priced from a native-to-base rate is shown
      // the way the FX panel shows it, not upside down.
      "the rate moved | GBP/MYR 5.4054 → 5.5556",
      "nothing explains it | balance moved, no transaction",
    ]);
  });

  it("gives every part a way into the rows behind it", () => {
    const view = ok(attributionView(report({ parts: [SPEND, RATE, UNEXPLAINED] })));
    expect(view.rows.map((r) => r.drillHref)).toEqual([
      // Exactly the window the spend was summed over, not "this month".
      "/transactions?from=2026-09-01&to=2026-09-07",
      "/net-worth",
      "/accounts",
    ]);
  });

  it("says 'you added' when the ledger ran positive", () => {
    const view = ok(attributionView(report({ parts: [{ ...SPEND, amountBase: 300, transactions: 1 }] })));
    expect(view.rows[0].label).toBe("you added");
    expect(view.rows[0].detail).toBe("1 transaction");
  });

  it("opens the account a revaluation belongs to, and does not call it unexplained", () => {
    const view = ok(attributionView(report({ parts: [{
      kind: "valuation", amountBase: 1800, transactions: null,
      accounts: [{ accountId: 7, name: "Flat", currency: "MYR", amountBase: 1800, fromRate: null, toRate: null }],
    }] })));
    expect(view.rows[0].label).toBe("the value was re-marked");
    expect(view.rows[0].detail).toBe("Flat, no transaction");
    expect(view.rows[0].drillHref).toBe("/accounts?account=7");
  });

  it("counts currencies rather than quoting one when several moved", () => {
    const view = ok(attributionView(report({ parts: [{ ...RATE, accounts: [
      RATE.accounts[0],
      { accountId: 5, name: "Wise", currency: "EUR", amountBase: -10, fromRate: 0.85, toRate: 0.86 },
    ] }] })));
    expect(view.rows[0].detail).toBe("2 currencies");
  });
});

describe("attributionView — when it must not draw the surface", () => {
  it("says what is missing rather than attributing the change to zero", () => {
    const view = attributionView(report({
      status: "insufficient", totalDeltaBase: null, periodFrom: null, periodRule: null,
      parts: [], dataAvailableSince: null, measuredAccounts: 0, unmeasurableAccounts: 8,
    }));
    // The type itself refuses a total here — there is no field to read a zero
    // out of, which is the point of the union.
    expect(view).toEqual({
      status: "insufficient",
      emptyReason: "Not enough history — no balance has been recorded before today",
    });
  });

  it("names the earliest day it does hold, when it holds one that does not qualify", () => {
    const view = attributionView(report({
      status: "insufficient", totalDeltaBase: null, periodFrom: null, periodRule: null,
      dataAvailableSince: "2026-08-08",
    }));
    expect(view?.status === "insufficient" && view.emptyReason).toBe("Not enough history — the first complete day is still 8 Aug");
  });

  it("returns null before the query resolves, so nothing is drawn from nothing", () => {
    expect(attributionView(undefined)).toBeNull();
  });
});

describe("attributionView — when the parts do not add up", () => {
  it("says so, and does not adjust a part to make the column agree", () => {
    const view = ok(attributionView(report({
      parts: [SPEND, RATE, UNEXPLAINED], balances: false, residualBase: -0.34,
    })));
    expect(view.warning).toBe("These do not add up — -0.34 is unaccounted for");
    // The rows are untouched: the discrepancy is stated, never absorbed.
    expect(view.rows.map((r) => r.amountBase)).toEqual([-27.04, -90, -42.41]);
  });

  it("reports unmeasured accounts as a coverage limit, not as an arithmetic failure", () => {
    const view = ok(attributionView(report({ parts: [SPEND], unmeasurableAccounts: 2 })));
    expect(view.warning).toBe("2 accounts not measured — no balance recorded on 1 Sep");
  });

  it("prefers the arithmetic failure when both are true — it is the more serious claim", () => {
    const view = ok(attributionView(report({
      parts: [SPEND], balances: false, residualBase: 5, unmeasurableAccounts: 2,
    })));
    expect(view.warning).toContain("do not add up");
  });
});

describe("shortDate", () => {
  it("reads a date-only string without letting a timezone move it a day", () => {
    expect(shortDate("2026-01-01")).toBe("1 Jan");
    expect(shortDate("2026-12-31")).toBe("31 Dec");
  });
});
