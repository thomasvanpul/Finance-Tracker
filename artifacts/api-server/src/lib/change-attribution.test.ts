// The one property that matters: the parts add to the headline. Everything
// else here exists to make sure they still add under the awkward cases.

import { describe, it, expect } from "vitest";
import {
  computeChangeAttribution,
  type AttributionAccountInput,
  type AttributionSnapshotInput,
  type AttributionTxInput,
  type ChangeAttributionReport,
} from "./change-attribution";

const TODAY = "2026-09-07";
const BASE = "2026-08-08";
const CAPTURED = new Date("2026-08-08T06:00:00Z");
const AFTER = new Date("2026-08-20T10:00:00Z");
const BEFORE = new Date("2026-08-01T10:00:00Z");

const identity = async (amount: number) => amount;

function account(over: Partial<AttributionAccountInput> = {}): AttributionAccountInput {
  return { id: 1, name: "Monzo", currency: "GBP", type: "cash", balance: 1000, currentRate: 1, ...over };
}

function snapshot(over: Partial<AttributionSnapshotInput> = {}): AttributionSnapshotInput {
  return { accountId: 1, date: BASE, balance: 1000, nativeToBaseRate: 1, capturedAt: CAPTURED, ...over };
}

function tx(over: Partial<AttributionTxInput> = {}): AttributionTxInput {
  return {
    accountId: 1, type: "expense", nativeAmount: 100, currency: "GBP",
    transferDirection: null, createdAt: AFTER, updatedAt: AFTER, ...over,
  };
}

function run(over: {
  accounts?: AttributionAccountInput[];
  snapshots?: AttributionSnapshotInput[];
  transactions?: AttributionTxInput[];
  today?: string;
} = {}) {
  return computeChangeAttribution({
    accounts: over.accounts ?? [account()],
    snapshots: over.snapshots ?? [snapshot()],
    transactions: over.transactions ?? [],
    today: over.today ?? TODAY,
    baseCurrency: "GBP",
    convert: identity,
  });
}

function part(report: ChangeAttributionReport, kind: string) {
  return report.parts.find((p) => p.kind === kind);
}

function sumOfParts(report: ChangeAttributionReport) {
  return report.parts.reduce((sum, p) => sum + p.amountBase, 0);
}

describe("computeChangeAttribution — the parts add to the headline", () => {
  it("splits a spend, a rate move and an unexplained edit, and they sum", async () => {
    // Wise EUR: 1,000 → 850 native, rate 0.85 → 0.90.
    //   rate     = 1000 × (0.90 − 0.85) =  50.00
    //   activity = (850 − 1000) × 0.90  = −135.00
    //   ledger   = −100 × 0.90          = −90.00   (one recorded expense)
    //   residual = −135 − (−90)         = −45.00
    const report = await run({
      accounts: [account({ id: 2, name: "Wise EUR", currency: "EUR", balance: 850, currentRate: 0.9 })],
      snapshots: [snapshot({ accountId: 2, balance: 1000, nativeToBaseRate: 0.85 })],
      transactions: [tx({ accountId: 2, currency: "EUR", nativeAmount: 100 })],
    });

    expect(report.status).toBe("ok");
    expect(report.totalDeltaBase).toBeCloseTo(-85, 6);
    expect(part(report, "rate")!.amountBase).toBeCloseTo(50, 6);
    expect(part(report, "spend")!.amountBase).toBeCloseTo(-90, 6);
    expect(part(report, "unexplained")!.amountBase).toBeCloseTo(-45, 6);
    expect(sumOfParts(report)).toBeCloseTo(report.totalDeltaBase!, 6);
    expect(report.residualBase).toBe(0);
    expect(report.balances).toBe(true);
  });

  it("carries the two rates the rate part is priced between", async () => {
    const report = await run({
      accounts: [account({ id: 2, currency: "MYR", balance: 5000, currentRate: 0.18 })],
      snapshots: [snapshot({ accountId: 2, balance: 5000, nativeToBaseRate: 0.185 })],
    });
    const share = part(report, "rate")!.accounts[0];
    expect(share.fromRate).toBe(0.185);
    expect(share.toRate).toBe(0.18);
    expect(share.currency).toBe("MYR");
  });

  it("counts the ledger rows it summed, so the spend line can say how many", async () => {
    const report = await run({
      transactions: [tx({ nativeAmount: 30 }), tx({ nativeAmount: 12 }), tx({ type: "income", nativeAmount: 5 })],
      accounts: [account({ balance: 963 })],
    });
    expect(part(report, "spend")!.transactions).toBe(3);
    expect(part(report, "spend")!.amountBase).toBeCloseTo(-37, 6);
    expect(sumOfParts(report)).toBeCloseTo(report.totalDeltaBase!, 6);
  });
});

describe("computeChangeAttribution — the fourth part", () => {
  it("calls a non-cash balance move a valuation, not an unexplained edit", async () => {
    // A property marked up by its owner is not money that went missing.
    const report = await run({
      accounts: [account({ id: 3, name: "Flat", type: "property", balance: 860_000, currency: "MYR", currentRate: 0.18 })],
      snapshots: [snapshot({ accountId: 3, balance: 850_000, nativeToBaseRate: 0.18 })],
    });
    expect(part(report, "unexplained")).toBeUndefined();
    expect(part(report, "valuation")!.amountBase).toBeCloseTo(1800, 6);
    expect(sumOfParts(report)).toBeCloseTo(report.totalDeltaBase!, 6);
  });

  it("keeps a cash residual and a non-cash residual in separate parts", async () => {
    const report = await run({
      accounts: [
        account({ id: 1, balance: 1100 }),
        account({ id: 3, name: "Flat", type: "property", balance: 2200 }),
      ],
      snapshots: [snapshot({ accountId: 1 }), snapshot({ accountId: 3, balance: 2000 })],
    });
    expect(part(report, "unexplained")!.amountBase).toBeCloseTo(100, 6);
    expect(part(report, "valuation")!.amountBase).toBeCloseTo(200, 6);
    expect(sumOfParts(report)).toBeCloseTo(report.totalDeltaBase!, 6);
  });
});

describe("computeChangeAttribution — no snapshot, no attribution", () => {
  it("is insufficient with no snapshot at all", async () => {
    const report = await run({ snapshots: [] });
    expect(report.status).toBe("insufficient");
    expect(report.totalDeltaBase).toBeNull();
    expect(report.parts).toEqual([]);
    expect(report.dataAvailableSince).toBeNull();
  });

  it("is insufficient when the only snapshot is today — a partial day cannot anchor a total", async () => {
    const report = await run({ snapshots: [snapshot({ date: TODAY })] });
    expect(report.status).toBe("insufficient");
  });

  it("never re-derives a missing baseline rate from today's rate", async () => {
    // The regression this guards: applying today's rate backwards makes the
    // rate share zero by construction, so a real drift reads as no drift.
    const report = await run({
      accounts: [account({ id: 2, currency: "EUR", balance: 1000, currentRate: 0.9 })],
      snapshots: [snapshot({ accountId: 2, balance: 1000, nativeToBaseRate: null })],
    });
    expect(report.status).toBe("insufficient");
    // Priceable today, but with no rate at the far end there is nothing to
    // compare against — so it is unmeasurable, not zero.
    expect(report.unmeasurableAccounts).toBe(1);
    expect(report.dataAvailableSince).toBeNull();
  });

  it("counts an account with no current rate as unmeasurable rather than attributing it to zero", async () => {
    const report = await run({
      accounts: [account({ id: 1 }), account({ id: 9, name: "Kwacha", currency: "ZMW", currentRate: null })],
      snapshots: [snapshot({ accountId: 1 }), snapshot({ accountId: 9, nativeToBaseRate: null })],
    });
    expect(report.status).toBe("ok");
    expect(report.measuredAccounts).toBe(1);
    expect(report.unmeasurableAccounts).toBe(1);
  });

  it("does not let an unattributable account veto the baseline for the ones that can be attributed", async () => {
    // The account with no rate has no snapshot on the baseline date either.
    // If it were allowed into completeBaselineDates the whole surface would
    // go dark because of one account that could never be shown anyway.
    const report = await run({
      accounts: [account({ id: 1, balance: 1100 }), account({ id: 9, currency: "ZMW", currentRate: null })],
      snapshots: [snapshot({ accountId: 1 })],
    });
    expect(report.status).toBe("ok");
    expect(report.periodFrom).toBe(BASE);
    expect(sumOfParts(report)).toBeCloseTo(report.totalDeltaBase!, 6);
  });
});

describe("computeChangeAttribution — the ledger boundary", () => {
  it("ignores a transaction written before the baseline was captured", async () => {
    // The baseline balance already contains it; counting it would double it.
    const report = await run({
      accounts: [account({ balance: 1000 })],
      transactions: [tx({ createdAt: BEFORE, updatedAt: BEFORE })],
    });
    expect(part(report, "spend")).toBeUndefined();
    expect(report.totalDeltaBase).toBe(0);
  });

  it("puts an unconvertible transaction in the residual rather than counting it as zero", async () => {
    const report = await computeChangeAttribution({
      accounts: [account({ balance: 900 })],
      snapshots: [snapshot()],
      transactions: [tx({ currency: "JPY", nativeAmount: 100 })],
      today: TODAY,
      baseCurrency: "GBP",
      convert: async () => null,
    });
    expect(part(report, "spend")).toBeUndefined();
    expect(part(report, "unexplained")!.amountBase).toBeCloseTo(-100, 6);
    expect(sumOfParts(report)).toBeCloseTo(report.totalDeltaBase!, 6);
  });

  it("uses month-to-date when the 1st qualifies, and says which rule it used", async () => {
    const report = await run({
      snapshots: [snapshot({ date: BASE }), snapshot({ date: "2026-09-01", balance: 1200 })],
      accounts: [account({ balance: 1000 })],
    });
    expect(report.periodRule).toBe("month-to-date");
    expect(report.periodFrom).toBe("2026-09-01");
    expect(report.totalDeltaBase).toBeCloseTo(-200, 6);
    expect(report.dataAvailableSince).toBe(BASE);
  });
});

describe("computeChangeAttribution — reporting shape", () => {
  it("omits a part that contributed nothing rather than showing a measured zero", async () => {
    const report = await run({ accounts: [account({ balance: 1100 })] });
    expect(report.parts.map((p) => p.kind)).toEqual(["unexplained"]);
  });

  it("drops a part whose accounts cancel, rather than printing a measured zero", async () => {
    // Two cash accounts move by the same amount in opposite directions with
    // no transactions behind either. The part contributed nothing to the
    // headline, and "nothing explains it  £0.00" would read as a measured
    // zero rather than as two moves that happened to net off.
    const report = await run({
      accounts: [account({ id: 1, balance: 1200 }), account({ id: 2, balance: 800 })],
      snapshots: [snapshot({ accountId: 1 }), snapshot({ accountId: 2 })],
    });
    expect(report.parts).toEqual([]);
    expect(report.totalDeltaBase).toBe(0);
    expect(report.balances).toBe(true);
  });

  it("drops float dust from a subtraction that should have been exact", async () => {
    // 0.1 + 0.2 arithmetic: the residual is ~1e-13, which is not zero and
    // would otherwise earn a line of its own.
    const report = await run({
      accounts: [account({ balance: 1000.3 })],
      snapshots: [snapshot({ balance: 1000.1 })],
      transactions: [tx({ type: "income", nativeAmount: 0.2 })],
    });
    expect(report.parts.map((p) => p.kind)).toEqual(["spend"]);
    expect(report.balances).toBe(true);
  });

  it("orders each part's accounts by magnitude, largest first", async () => {
    const report = await run({
      accounts: [
        account({ id: 1, name: "Small", balance: 1010 }),
        account({ id: 2, name: "Large", balance: 1300 }),
      ],
      snapshots: [snapshot({ accountId: 1 }), snapshot({ accountId: 2 })],
    });
    expect(part(report, "unexplained")!.accounts.map((a) => a.name)).toEqual(["Large", "Small"]);
  });

  it("reports the window it measured", async () => {
    const report = await run();
    expect(report.periodFrom).toBe(BASE);
    expect(report.periodTo).toBe(TODAY);
    expect(report.days).toBe(30);
  });
});
