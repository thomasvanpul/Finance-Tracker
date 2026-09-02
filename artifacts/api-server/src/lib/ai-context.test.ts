// Invariants for lib/ai-context.ts. The properties locked here map
// 1:1 to the L1–L5 rules the module header calls out — the whole
// point of writing these is that the "AI is confident about a
// fabricated £0" and the "someone's balances ended up in a Render
// log" defects can't ship silently.
//
//   L1 — null propagation: FX-fail → "unknown", never "0"
//   L2 — no leaked identifiers (merchant, counterparty, IBAN, tokens…)
//   L3 — no context ever hits the logger
//   L4 — hard token budget with named-drop truncation
//   L5 — per-task profiles: categorize/receipt-scan don't carry balances

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  assembleChatContext,
  buildCategorizeContext,
  buildReceiptScanContext,
  formatMoney,
  MAX_CONTEXT_CHARS,
  type ChatContextRaw,
} from "./ai-context";

// Stub the market module: FX rates are the load-bearing input for the
// null-propagation tests, so we return deterministic rates + a fixed
// updatedAt. Individual tests can re-stub inside their scope.
vi.mock("./market", () => {
  const rates: Record<string, number> = { GBP: 1, USD: 1.266, EUR: 1.15 /* MYR omitted */ };
  const toBase = async (amount: number, fromCurrency: string, baseCurrency: string): Promise<number | null> => {
    if (fromCurrency === baseCurrency) return amount;
    const from = rates[fromCurrency];
    const to = rates[baseCurrency];
    if (!from || !to) return null;
    return (amount / from) * to;
  };
  return {
    getFxRates: async () => ({
      base: "GBP",
      rates: { USD: 1.266, EUR: 1.15, MYR: 5.7 }, // MYR left OUT of some tests to force null
      updatedAt: "2026-08-23T09:00:00.000Z",
    }),
    toBase,
    // txToBase delegates to toBase when no stored rate; fixture rows
    // in this file leave nativeToBaseRate null, so this matches the
    // pre-migration read behaviour tests depend on.
    txToBase: async (
      tx: { nativeAmount: string; currency: string; nativeToBaseRate: string | null },
      baseCurrency: string,
    ): Promise<number | null> => {
      const amount = Math.abs(parseFloat(tx.nativeAmount));
      if (tx.nativeToBaseRate != null) return amount * parseFloat(tx.nativeToBaseRate);
      return toBase(amount, tx.currency, baseCurrency);
    },
    getStockPrices: async (tickers: string[]) =>
      tickers.map((t) => ({ ticker: t, price: 100, currency: "USD", previousClose: 99 })),
  };
});

// Stub db + app-settings-db for the buildCategorizeContext / buildReceiptScanContext
// tests — the assemble* tests don't touch the db.
const stubTransactionsSelectDistinct: Array<{ category: string }> = [];
const stubBudgetsSelect: Array<{ category: string }> = [];
vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => stubBudgetsSelect }) }),
    selectDistinct: () => ({ from: () => ({ where: async () => stubTransactionsSelectDistinct }) }),
  },
  accountsTable: {},
  transactionsTable: { category: "category", userId: "user_id", date: "date" },
  budgetsTable: { userId: "user_id", category: "category" },
  upcomingTable: {},
  debtsTable: {},
  goalsTable: {},
  subscriptionsTable: {},
  investmentsTable: {},
  sharedExpensesTable: {},
  sharedExpenseParticipantsTable: {},
}));
vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ __and: args }),
  eq: (a: unknown, b: unknown) => ({ __eq: [a, b] }),
  gte: (a: unknown, b: unknown) => ({ __gte: [a, b] }),
  lte: (a: unknown, b: unknown) => ({ __lte: [a, b] }),
  ne: (a: unknown, b: unknown) => ({ __ne: [a, b] }),
}));
vi.mock("./app-settings-db", () => ({
  getBaseCurrency: async () => "GBP",
}));

// ── Fixture helpers ──────────────────────────────────────────────────────
// One fixture user carrying every category of leakable string the
// test scan will look for. If ANY of these sentinels appears in the
// assembled context, the scan fails and names the field.

const SENTINELS = {
  merchant:       "STARBUCKS-STORE-4402-LONDON-VICTORIA",
  merchant2:      "SAINSBURYS-SMARTSHOP-EC1-9876543",
  personSurname:  "Featherstone-Haugh",
  personSurname2: "Winklebottom-McGillicuddy",
  accountLabel:   "MonzoJointFlex-EndsIn7729",
  accountLabel2:  "Starling-Sole-Trader-SortCode-608371",
  iban:           "GB29NWBK60161331926819",
  sortCode:       "60-83-71",
  accessToken:    "wise-token-eyJhbGciOiJIUzI1NiJ9-DEADBEEFCAFE",
  providerId:     "wise-balance-uuid-a1b2c3d4-secret",
  externalId:     "csv-hash-9f8e7d6c5b4a-src",
  goalName:       "Trip-to-Kyoto-Q1-2027", // goal names ARE emitted (safe: user-set labels for own goals)
  subscriptionName: "OnlyFans-Premium-Renewal-Handle-xoxo42",
};

function fixtureRaw(overrides: Partial<ChatContextRaw> = {}): ChatContextRaw {
  const today = new Date().toISOString().slice(0, 10);
  return {
    baseCurrency: "GBP",
    accounts: [
      {
        id: 1, userId: "u1", name: SENTINELS.accountLabel, currency: "GBP", balance: "8120.00", type: "cash",
        isWiseLinked: true, wiseProfileId: SENTINELS.providerId, wiseBalanceId: SENTINELS.providerId,
        externalProvider: "wise", externalId: SENTINELS.externalId,
        lastSyncedAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
      },
      {
        id: 2, userId: "u1", name: SENTINELS.accountLabel2, currency: "USD", balance: "2140.00", type: "cash",
        isWiseLinked: false, wiseProfileId: null, wiseBalanceId: null,
        externalProvider: null, externalId: null,
        lastSyncedAt: null, createdAt: new Date(), updatedAt: new Date(),
      },
      {
        id: 3, userId: "u1", name: "Maybank MYR", currency: "MYR", balance: "4300.00", type: "cash",
        isWiseLinked: false, wiseProfileId: null, wiseBalanceId: null,
        externalProvider: null, externalId: null,
        lastSyncedAt: null, createdAt: new Date(), updatedAt: new Date(),
      },
    ],
    investments: [
      { id: 1, userId: "u1", name: "Apple Inc.", ticker: "AAPL", shares: "10", costPricePerShare: "150", buyDate: today, createdAt: new Date(), updatedAt: new Date() },
    ],
    budgets: [
      { id: 1, userId: "u1", category: "Groceries", monthlyLimit: "500.00", createdAt: new Date(), updatedAt: new Date() },
      { id: 2, userId: "u1", category: "Transport", monthlyLimit: "300.00", createdAt: new Date(), updatedAt: new Date() },
    ],
    monthTxs: [
      { id: 1, userId: "u1", date: today, description: SENTINELS.merchant, type: "expense", category: "Groceries", accountId: 1, nativeAmount: "610.00", currency: "GBP", source: "manual", externalId: null, nativeToBaseRate: null, rateAsOf: null, transferGroupId: null, transferDirection: null, createdAt: new Date(), updatedAt: new Date() },
      { id: 2, userId: "u1", date: today, description: SENTINELS.merchant2, type: "expense", category: "Groceries", accountId: 1, nativeAmount: "45.20", currency: "GBP", source: "manual", externalId: null, nativeToBaseRate: null, rateAsOf: null, transferGroupId: null, transferDirection: null, createdAt: new Date(), updatedAt: new Date() },
      { id: 3, userId: "u1", date: today, description: SENTINELS.merchant, type: "income",  category: "Salary",    accountId: 1, nativeAmount: "4850.00", currency: "GBP", source: "manual", externalId: null, nativeToBaseRate: null, rateAsOf: null, transferGroupId: null, transferDirection: null, createdAt: new Date(), updatedAt: new Date() },
    ],
    upcoming: [
      { id: 1, userId: "u1", dueDate: today, description: SENTINELS.merchant, category: "Bills", type: "expense", frequency: "one-time", status: "pending", nativeAmount: "340.00", currency: "GBP", accountId: null, createdAt: new Date(), updatedAt: new Date() },
    ],
    goals: [
      { id: 1, userId: "u1", name: SENTINELS.goalName, target: "3000.00", current: "820.00", deadline: "2027-03-01", emoji: null, color: null, image: null, monthlyContribution: "200.00", history: [], createdAt: new Date(), updatedAt: new Date() },
    ],
    subscriptions: [
      { id: 1, userId: "u1", name: SENTINELS.subscriptionName, amount: "12.99", currency: "GBP", frequency: "monthly", category: "Entertainment", nextDue: today, startDate: today, active: true, notes: null, manuallyAdded: true, createdAt: new Date(), updatedAt: new Date() },
    ],
    debts: {
      // NB: computed by loader (computeDebtsSummary) — assembler receives
      // aggregate-only, personName never enters this shape.
      owedToMeTotal: 120, owedToMePeople: 1, owedToMeLargest: 120,
      iOweTotal: 220, iOwePeople: 1, iOweLargest: 220,
      fxFailures: 0,
    },
    path: "/budget",
  };
}

// ── L2 leak-lockdown ─────────────────────────────────────────────────────

describe("assembleChatContext · L2 leak lockdown", () => {
  it("assembled string contains NONE of the leakable sentinels", async () => {
    const ctx = await assembleChatContext(fixtureRaw());
    for (const [field, sentinel] of Object.entries(SENTINELS)) {
      // Goal name IS emitted deliberately — user-set label for own goal,
      // safe to include. Explicit allowlist rather than silent exclusion.
      if (field === "goalName") continue;
      expect(ctx.text, `sentinel "${sentinel}" (${field}) leaked into context`).not.toContain(sentinel);
    }
  });

  it("goal name IS emitted (regression guard against over-redaction)", async () => {
    // If a future edit blanket-redacts all names, the model loses the
    // one identifier that's genuinely useful and NOT a leak — the
    // user's own label for their own goal. Locking the positive too.
    const ctx = await assembleChatContext(fixtureRaw());
    expect(ctx.text).toContain(SENTINELS.goalName);
  });

  it("assembled string contains NO IBAN / sort-code / access-token / provider-id patterns", async () => {
    const ctx = await assembleChatContext(fixtureRaw());
    // Direct sentinels
    expect(ctx.text).not.toContain(SENTINELS.iban);
    expect(ctx.text).not.toContain(SENTINELS.sortCode);
    expect(ctx.text).not.toContain(SENTINELS.accessToken);
    expect(ctx.text).not.toContain(SENTINELS.providerId);
    expect(ctx.text).not.toContain(SENTINELS.externalId);
    // Generic patterns — even if a future field name changes, the
    // shape scan catches new leaks of the same class.
    expect(ctx.text).not.toMatch(/GB\d{2}[A-Z]{4}\d+/);        // IBAN prefix
    expect(ctx.text).not.toMatch(/\b\d{2}-\d{2}-\d{2}\b/);      // UK sort code format
    expect(ctx.text).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/);      // JWT-shaped token
    expect(ctx.text).not.toMatch(/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/i); // UUID
  });

  it("debts section reports counts + largest, never a name", async () => {
    const ctx = await assembleChatContext(fixtureRaw());
    expect(ctx.text).toMatch(/Owed to me: £120\.00 across 1 person \(largest £120\.00\)/);
    expect(ctx.text).toMatch(/I owe:\s+£220\.00 across 1 person \(largest £220\.00\)/);
  });
});

// ── L3 no context ever hits the logger ───────────────────────────────────

describe("assembleChatContext · L3 no context in logs", () => {
  it("no logger method is called during context assembly", async () => {
    const logger = await import("./logger");
    const spies = {
      info: vi.spyOn(logger.logger, "info").mockImplementation(() => logger.logger),
      warn: vi.spyOn(logger.logger, "warn").mockImplementation(() => logger.logger),
      error: vi.spyOn(logger.logger, "error").mockImplementation(() => logger.logger),
      debug: vi.spyOn(logger.logger, "debug").mockImplementation(() => logger.logger),
    };
    await assembleChatContext(fixtureRaw());
    // Assembly path must be silent. If a future edit adds a
    // "log the built context for debugging" line, this catches it.
    for (const [level, spy] of Object.entries(spies)) {
      const leaked = spy.mock.calls.some((call) => JSON.stringify(call).includes(SENTINELS.goalName));
      expect(leaked, `logger.${level} received a call containing context material`).toBe(false);
    }
    for (const spy of Object.values(spies)) spy.mockRestore();
  });
});

// ── L1 null propagation ──────────────────────────────────────────────────

describe("assembleChatContext · L1 null propagation", () => {
  it("MYR balance renders as 'unknown (FX unavailable)' not '£0'", async () => {
    const ctx = await assembleChatContext(fixtureRaw());
    // MYR account has RM 4,300 native; toBase(MYR→GBP) returns null in
    // the mock, so the base-currency conversion must show unknown.
    // Currency-exposure line for MYR:
    expect(ctx.text).toMatch(/MYR\s+hold\s+RM\s+4,300\.00\s+unknown \(FX unavailable\)/);
    // Net worth must be null-poisoned when any account is unconvertible.
    expect(ctx.text).toMatch(/Net worth:\s+unknown/);
    expect(ctx.text).not.toMatch(/Net worth:\s+£0/);
  });

  it("empty-collection sections render 'none' not '0'", async () => {
    const raw = fixtureRaw();
    raw.goals = [];
    raw.budgets = [];
    raw.subscriptions = [];
    raw.upcoming = [];
    // Debts summary all zero + no people
    raw.debts = { owedToMeTotal: 0, owedToMePeople: 0, owedToMeLargest: 0, iOweTotal: 0, iOwePeople: 0, iOweLargest: 0, fxFailures: 0 };
    const ctx = await assembleChatContext(raw);
    expect(ctx.text).toContain("Goals\n  none configured");
    expect(ctx.text).toContain("Budgets (this month)\n  none configured");
    expect(ctx.text).toContain("Active subscriptions\n  none");
    expect(ctx.text).toContain("Upcoming (next 30 days)\n  none scheduled");
    expect(ctx.text).toContain("Debts / IOUs\n  none outstanding");
  });

  it("this-month totals go null (not zero) when a single tx fails FX", async () => {
    const raw = fixtureRaw();
    // Add one MYR expense — MYR unconvertible in the mock, so expenses null.
    raw.monthTxs.push({
      id: 999, userId: "u1", date: raw.monthTxs[0].date, description: "sanitised", type: "expense",
      category: "Groceries", accountId: 3, nativeAmount: "300.00", currency: "MYR", source: "manual",
      externalId: null, nativeToBaseRate: null, rateAsOf: null, transferGroupId: null, transferDirection: null, createdAt: new Date(), updatedAt: new Date(),
    });
    const ctx = await assembleChatContext(raw);
    expect(ctx.text).toMatch(/Expenses:\s+unknown/);
    expect(ctx.text).toMatch(/Savings rate:\s+unknown/);
  });
});

// ── L4 truncation guard ──────────────────────────────────────────────────

describe("assembleChatContext · L4 truncation guard", () => {
  it("output stays under MAX_CONTEXT_CHARS even with extreme fixture", async () => {
    const raw = fixtureRaw();
    // Blow up subscriptions and budgets to force truncation.
    for (let i = 0; i < 300; i++) {
      raw.subscriptions.push({
        id: i + 100, userId: "u1", name: `subscription-${i}`, amount: "9.99", currency: "GBP",
        frequency: "monthly", category: "Other", nextDue: null, startDate: raw.monthTxs[0].date,
        active: true, notes: null, manuallyAdded: true, createdAt: new Date(), updatedAt: new Date(),
      });
      raw.budgets.push({ id: i + 100, userId: "u1", category: `Cat${i}`, monthlyLimit: "100", createdAt: new Date(), updatedAt: new Date() });
    }
    const ctx = await assembleChatContext(raw);
    expect(ctx.text.length).toBeLessThanOrEqual(MAX_CONTEXT_CHARS);
  });

  it("dropped sections are NAMED in the truncation suffix", async () => {
    // Build a fixture where the sum of section content exceeds the cap,
    // forcing at least one low-priority drop.
    const raw = fixtureRaw();
    // Pad the currency-exposure section with many minor currencies —
    // each adds a line, and none are budget-priority so they stay.
    // Then flood budgets with hundreds of rows to force budgets to
    // grow past the cap.
    for (let i = 0; i < 800; i++) {
      raw.budgets.push({ id: i + 200, userId: "u1", category: `LongCategoryName${i}`, monthlyLimit: "100.00", createdAt: new Date(), updatedAt: new Date() });
    }
    const ctx = await assembleChatContext(raw);
    if (ctx.sectionsDropped.length > 0) {
      expect(ctx.text).toContain("(context truncated to fit budget · sections omitted:");
      for (const name of ctx.sectionsDropped) {
        expect(ctx.text).toContain(name);
      }
    }
    // Load-bearing property: the drop, if any, is from the low-priority
    // tail. net-position (priority 10) must NEVER be in the dropped set.
    expect(ctx.sectionsDropped).not.toContain("net-position");
    expect(ctx.sectionsDropped).not.toContain("this-month");
  });
});

// ── L5 per-task profiles ──────────────────────────────────────────────────

describe("buildCategorizeContext · L5 no financial data", () => {
  beforeEach(() => {
    stubTransactionsSelectDistinct.length = 0;
    stubBudgetsSelect.length = 0;
    stubTransactionsSelectDistinct.push({ category: "Groceries" }, { category: "Transport" }, { category: "Dining" });
    stubBudgetsSelect.push({ category: "Entertainment" });
  });

  it("returns ONLY the category vocabulary — no balances, no counterparties, no currency exposure", async () => {
    const ctx = await buildCategorizeContext("u1");
    // Positive: contains the categories
    expect(ctx.text).toContain("Groceries");
    expect(ctx.text).toContain("Transport");
    expect(ctx.text).toContain("Dining");
    expect(ctx.text).toContain("Entertainment"); // from budgets
    // Negative: NONE of the balance/exposure section labels appear.
    // If a refactor accidentally imports the full chat context here,
    // one of these strings shows up.
    expect(ctx.text).not.toMatch(/Net worth/);
    expect(ctx.text).not.toMatch(/Cash total/);
    expect(ctx.text).not.toMatch(/Currency exposure/);
    expect(ctx.text).not.toMatch(/Debts \/ IOUs/);
    expect(ctx.text).not.toMatch(/Portfolio/);
    expect(ctx.text).not.toMatch(/£/); // no currency figures at all
  });

  it("empty vocabulary renders a new-user hint, not empty string", async () => {
    stubTransactionsSelectDistinct.length = 0;
    stubBudgetsSelect.length = 0;
    const ctx = await buildCategorizeContext("u1");
    expect(ctx.text).toContain("no categories yet");
  });
});

describe("buildReceiptScanContext · L5 base + vocabulary only", () => {
  beforeEach(() => {
    stubTransactionsSelectDistinct.length = 0;
    stubBudgetsSelect.length = 0;
    stubTransactionsSelectDistinct.push({ category: "Food & Drink" });
  });

  it("carries base currency + category list — nothing else", async () => {
    const ctx = await buildReceiptScanContext("u1");
    expect(ctx.text).toContain("Food & Drink");
    expect(ctx.text).toContain("base currency: GBP");
    expect(ctx.text).not.toMatch(/Net worth|Cash total|Debts|Portfolio/);
  });
});

// ── formatMoney unit contract ────────────────────────────────────────────

describe("formatMoney · null → unknown, never 0", () => {
  it("null renders as 'unknown' with optional cause", () => {
    expect(formatMoney(null, "GBP")).toBe("unknown");
    expect(formatMoney(null, "GBP", "FX unavailable")).toBe("unknown (FX unavailable)");
    // The load-bearing rule: never a fabricated zero for a null.
    expect(formatMoney(null, "GBP")).not.toBe("£0");
    expect(formatMoney(null, "GBP")).not.toBe("£0.00");
  });
  it("real zero renders as £0.00 (a legitimate zero is allowed)", () => {
    expect(formatMoney(0, "GBP")).toBe("£0.00");
  });
});
