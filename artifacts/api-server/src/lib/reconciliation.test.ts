// Reconciliation gap arithmetic and period rule. Pure — no DB, FX passed in.

import { describe, it, expect } from "vitest";
import {
  computeReconciliation,
  completeBaselineDates,
  choosePeriod,
  signedEffect,
  type ReconciliationInput,
  type ReconciliationTxInput,
} from "./reconciliation";

const identityFx: ReconciliationInput["convert"] = async (amount, from, to) =>
  from === to ? amount : from === "EUR" && to === "GBP" ? amount * 0.86 : null;

const T0 = new Date("2026-09-03T05:00:00Z");
const before = new Date("2026-09-01T12:00:00Z");
const after = new Date("2026-09-04T12:00:00Z");

function tx(partial: Partial<ReconciliationTxInput> & { accountId: number; nativeAmount: number }): ReconciliationTxInput {
  return {
    type: "expense",
    currency: "GBP",
    transferDirection: null,
    createdAt: after,
    updatedAt: after,
    ...partial,
  };
}

function base(over: Partial<ReconciliationInput> = {}): ReconciliationInput {
  return {
    cashAccounts: [{ id: 1, name: "Current", currency: "GBP", balance: 100 }],
    snapshots: [{ accountId: 1, date: "2026-09-03", balance: 100, capturedAt: T0 }],
    transactions: [],
    today: "2026-09-05",
    baseCurrency: "GBP",
    convert: identityFx,
    ...over,
  };
}

describe("signedEffect mirrors adjustAccountBalance", () => {
  it("income adds, expense subtracts", () => {
    expect(signedEffect({ type: "income", nativeAmount: 10, transferDirection: null })).toBe(10);
    expect(signedEffect({ type: "expense", nativeAmount: 10, transferDirection: null })).toBe(-10);
  });
  it("transfer legs follow direction; a legacy direction-less transfer is a no-op", () => {
    expect(signedEffect({ type: "transfer", nativeAmount: 10, transferDirection: "out" })).toBe(-10);
    expect(signedEffect({ type: "transfer", nativeAmount: 10, transferDirection: "in" })).toBe(10);
    expect(signedEffect({ type: "transfer", nativeAmount: 10, transferDirection: null })).toBe(0);
  });
});

describe("period rule", () => {
  it("a date is a baseline only when every cash account has a row on it, and it is before today", () => {
    const snaps = [
      { accountId: 1, date: "2026-09-02", balance: 0, capturedAt: T0 },
      { accountId: 1, date: "2026-09-03", balance: 0, capturedAt: T0 },
      { accountId: 2, date: "2026-09-03", balance: 0, capturedAt: T0 },
      { accountId: 1, date: "2026-09-05", balance: 0, capturedAt: T0 },
      { accountId: 2, date: "2026-09-05", balance: 0, capturedAt: T0 },
    ];
    expect(completeBaselineDates([1, 2], snaps, "2026-09-05")).toEqual(["2026-09-03"]);
  });
  it("prefers month-to-date when the 1st qualifies, else the earliest qualifying date", () => {
    expect(choosePeriod(["2026-09-01", "2026-09-03"], "2026-09-05")).toEqual({ rule: "month-to-date", from: "2026-09-01" });
    expect(choosePeriod(["2026-08-20", "2026-09-03"], "2026-09-05")).toEqual({ rule: "since-first-snapshot", from: "2026-08-20" });
    expect(choosePeriod([], "2026-09-05")).toBeNull();
  });
});

describe("computeReconciliation", () => {
  it("is insufficient with no qualifying baseline, and carries no figure", async () => {
    const r = await computeReconciliation(base({ snapshots: [{ accountId: 1, date: "2026-09-05", balance: 100, capturedAt: T0 }] }));
    expect(r.status).toBe("insufficient");
    expect(r.gapBase).toBeNull();
    expect(r.periodFrom).toBeNull();
    expect(r.accounts).toEqual([]);
    expect(r.dataAvailableSince).toBe("2026-09-05");
  });

  it("is insufficient with no cash accounts", async () => {
    const r = await computeReconciliation(base({ cashAccounts: [], snapshots: [] }));
    expect(r.status).toBe("insufficient");
    expect(r.dataAvailableSince).toBeNull();
  });

  it("balance moved, nothing recorded → the whole movement is the gap", async () => {
    const r = await computeReconciliation(base({ cashAccounts: [{ id: 1, name: "Current", currency: "GBP", balance: 60 }] }));
    expect(r.status).toBe("ok");
    expect(r.periodRule).toBe("since-first-snapshot");
    expect(r.periodFrom).toBe("2026-09-03");
    expect(r.days).toBe(2);
    expect(r.accounts[0]).toMatchObject({ balanceChange: -40, ledgerChange: 0, gap: -40, gapBase: -40, transactionsCounted: 0 });
    expect(r.gapBase).toBe(-40);
  });

  it("balance moved and the ledger explains it → zero gap", async () => {
    const r = await computeReconciliation(base({
      cashAccounts: [{ id: 1, name: "Current", currency: "GBP", balance: 60 }],
      transactions: [tx({ accountId: 1, nativeAmount: 40 })],
    }));
    expect(r.accounts[0]).toMatchObject({ balanceChange: -40, ledgerChange: -40, gap: 0, transactionsCounted: 1 });
    expect(r.gapBase).toBe(0);
  });

  it("uses createdAt against the baseline capturedAt, not the transaction date", async () => {
    const r = await computeReconciliation(base({
      cashAccounts: [{ id: 1, name: "Current", currency: "GBP", balance: 60 }],
      transactions: [tx({ accountId: 1, nativeAmount: 40, createdAt: before, updatedAt: before })],
    }));
    // Created before the baseline: already inside the baseline balance, so not counted.
    expect(r.accounts[0]).toMatchObject({ ledgerChange: 0, gap: -40, transactionsCounted: 0, editedSinceBaseline: 0 });
  });

  it("counts pre-baseline transactions edited after the baseline instead of guessing their delta", async () => {
    const r = await computeReconciliation(base({
      cashAccounts: [{ id: 1, name: "Current", currency: "GBP", balance: 90 }],
      transactions: [tx({ accountId: 1, nativeAmount: 50, createdAt: before, updatedAt: after })],
    }));
    expect(r.accounts[0]).toMatchObject({ gap: -10, editedSinceBaseline: 1, transactionsCounted: 0 });
  });

  it("a transfer between two cash accounts nets to zero gap on both sides", async () => {
    const r = await computeReconciliation(base({
      cashAccounts: [
        { id: 1, name: "Current", currency: "GBP", balance: 70 },
        { id: 2, name: "Savings", currency: "GBP", balance: 230 },
      ],
      snapshots: [
        { accountId: 1, date: "2026-09-03", balance: 100, capturedAt: T0 },
        { accountId: 2, date: "2026-09-03", balance: 200, capturedAt: T0 },
      ],
      transactions: [
        tx({ accountId: 1, type: "transfer", transferDirection: "out", nativeAmount: 30 }),
        tx({ accountId: 2, type: "transfer", transferDirection: "in", nativeAmount: 30 }),
      ],
    }));
    expect(r.accounts.map((a) => a.gap)).toEqual([0, 0]);
    expect(r.gapBase).toBe(0);
  });

  it("converts a foreign account's gap to base and reports an unconvertible one instead of inventing it", async () => {
    const r = await computeReconciliation(base({
      cashAccounts: [
        { id: 1, name: "Current", currency: "GBP", balance: 100 },
        { id: 2, name: "Wise EUR", currency: "EUR", balance: 90 },
        { id: 3, name: "Maybank", currency: "MYR", balance: 900 },
      ],
      snapshots: [
        { accountId: 1, date: "2026-09-03", balance: 100, capturedAt: T0 },
        { accountId: 2, date: "2026-09-03", balance: 100, capturedAt: T0 },
        { accountId: 3, date: "2026-09-03", balance: 1000, capturedAt: T0 },
      ],
    }));
    expect(r.accounts[1]).toMatchObject({ gap: -10, gapBase: -8.6 });
    expect(r.accounts[2]).toMatchObject({ gap: -100, gapBase: null });
    expect(r.gapBase).toBe(-8.6);
    expect(r.unconvertibleAccounts).toBe(1);
  });

  it("a transaction in a currency the account cannot convert is skipped and counted", async () => {
    const r = await computeReconciliation(base({
      cashAccounts: [{ id: 1, name: "Current", currency: "GBP", balance: 100 }],
      transactions: [tx({ accountId: 1, nativeAmount: 10, currency: "MYR" })],
    }));
    expect(r.accounts[0]).toMatchObject({ fxSkippedTransactions: 1, transactionsCounted: 0, ledgerChange: 0 });
  });

  it("switches to month-to-date once the 1st has a complete snapshot", async () => {
    const r = await computeReconciliation(base({
      snapshots: [
        { accountId: 1, date: "2026-08-20", balance: 100, capturedAt: T0 },
        { accountId: 1, date: "2026-09-01", balance: 100, capturedAt: T0 },
      ],
    }));
    expect(r.periodRule).toBe("month-to-date");
    expect(r.periodFrom).toBe("2026-09-01");
    expect(r.dataAvailableSince).toBe("2026-08-20");
    expect(r.days).toBe(4);
  });
});
