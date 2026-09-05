import { describe, it, expect, vi } from "vitest";
import { reconciliationInsight, reconciliationPeriodLabel } from "./reconciliation-insight";
import type { ReconciliationReport } from "@workspace/api-client-react";

function report(over: Partial<ReconciliationReport> = {}): ReconciliationReport {
  return {
    status: "ok",
    baseCurrency: "GBP",
    periodRule: "since-first-snapshot",
    periodFrom: "2026-09-03",
    periodTo: "2026-09-05",
    days: 2,
    dataAvailableSince: "2026-09-03",
    gapBase: -40,
    accounts: [{
      accountId: 87, name: "Monzo Current", currency: "GBP", baselineDate: "2026-09-03",
      baselineBalance: 2450.3, currentBalance: 2410.3, balanceChange: -40, ledgerChange: 0,
      gap: -40, gapBase: -40, transactionsCounted: 0, editedSinceBaseline: 0, fxSkippedTransactions: 0,
    }],
    unconvertibleAccounts: 0,
    ...over,
  };
}

describe("reconciliationInsight", () => {
  it("is silent below minimum history — never a fabricated zero", () => {
    expect(reconciliationInsight(report({ status: "insufficient", gapBase: null, periodFrom: null, periodRule: null, accounts: [] }), vi.fn())).toBeNull();
    expect(reconciliationInsight(undefined, vi.fn())).toBeNull();
  });

  it("is silent when the ledger explains every movement", () => {
    expect(reconciliationInsight(report({ gapBase: 0 }), vi.fn())).toBeNull();
    expect(reconciliationInsight(report({ gapBase: 0.004 }), vi.fn())).toBeNull();
  });

  it("states the magnitude, the period and where, with one action", () => {
    const onPlace = vi.fn();
    const insight = reconciliationInsight(report(), onPlace)!;
    expect(insight.headline).toBe("£40.00 unaccounted since 3 Sep");
    expect(insight.body).toBe("£40.00 left Monzo Current, unrecorded.");
    expect(insight.action?.label).toBe("Place it");
    insight.action!.onTap();
    expect(onPlace).toHaveBeenCalledOnce();
    expect(insight.id).toBe("reconciliation:2026-09-03:-4000");
  });

  it("names the count of accounts when more than one moved", () => {
    const two = report({
      gapBase: 55,
      accounts: [
        { ...report().accounts[0], gap: 40, gapBase: 40 },
        { ...report().accounts[0], accountId: 88, name: "Barclays Savings", gap: 15, gapBase: 15 },
      ],
    });
    expect(reconciliationInsight(two, vi.fn())!.body).toBe("£55.00 entered 2 accounts, unrecorded.");
  });

  it("says when an account is missing from the figure", () => {
    expect(reconciliationInsight(report({ unconvertibleAccounts: 1 }), vi.fn())!.body).toContain("1 account could not be converted");
  });

  it("labels the period by rule", () => {
    expect(reconciliationPeriodLabel({ periodRule: "month-to-date", periodFrom: "2026-09-01" })).toBe("this month");
    expect(reconciliationPeriodLabel({ periodRule: "since-first-snapshot", periodFrom: "2026-09-03" })).toBe("since 3 Sep");
  });
});
