// monthly-money.lock.test.ts
//
// WHAT THIS GUARDS
//
// "Monthly income" and "savings rate" had four answers at once. Measured on
// the seeded persona, 5 Oct 2026, same account, same minute:
//
//   dashboard KPI bar     MONTHLY INCOME +£1,250.00   SAVINGS RATE -2%
//   /analytics KPI bar    Savings Rate · this month   2.5%
//   /analytics runway     Avg Mo. Income £1,250.00    Save Rate 26.6%
//   /cashflow             in £1,250.00/mo             (no rate shown)
//   /whatif               income assumed £3,000       (invented outright)
//
// Three of those are legitimately different quantities — a month, a 90-day
// trend, an average over recorded months — and one was fiction. Nothing on
// screen said which was which, so a user comparing two tabs had no way to
// tell a different window from a contradiction.
//
// `lib/monthly-money.ts` now holds ONE definition of both. This lock has two
// halves:
//
//   PART A  the definition itself — what it returns for a null, a zero and a
//           negative month. This is the part worth most: if an unrecorded
//           month ever again returns 0 instead of null, every surface starts
//           showing 0% at once and the screenshots will not tell you.
//
//   PART B  a source lock that the four surfaces item 10 names actually call
//           it, and that none of them reads `thisMonth.savingsRate` or
//           `thisMonth.income` directly any more. That direct read is how a
//           fifth answer gets added.
//
// WHAT THIS LOCK CANNOT DO — stated rather than left to be discovered
//
//   - It does not prove the four surfaces RENDER the same string. A regex
//     cannot see a React tree. The four call one function with one input, and
//     the capture in .review/shots/t1/ is the record of what they rendered;
//     neither is a substitute for the other.
//   - It covers the four files item 10 names. Eleven further files mention a
//     savings rate (/health-score, /goals, /reports, /year-review, the
//     widgets), and those are T3's and T4's. A pass here says nothing about
//     them.
//   - It does not forbid a surface from computing a DIFFERENT quantity. It
//     forbids computing THIS one twice. /analytics' runway panel still
//     averages over recorded months on purpose, and says so on its label.
//
// If this fails, fix the caller. Do not relax the pattern.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  monthlyMoney,
  hasRecordedIncome,
  recordedAnnualIncome,
  UNKNOWN_FIGURE,
} from "./monthly-money";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..");

// ── PART A: the definition ───────────────────────────────────────────────────

describe("monthlyMoney — the one definition", () => {
  it("an absent month is unknown, not zero", () => {
    for (const input of [null, undefined, {}]) {
      expect(monthlyMoney(input as never)).toEqual({
        income: null,
        expenses: null,
        netSavings: null,
        savingsRate: null,
      });
    }
  });

  it("income of zero is unknown — a rate with no denominator is not 0%", () => {
    // This is the whole point. 0/0 is NaN, x/0 is Infinity, and both used to
    // arrive on screen as a number through a `?? 0`.
    const m = monthlyMoney({ income: 0, expenses: 400 });
    expect(m.income).toBeNull();
    expect(m.savingsRate).toBeNull();
    expect(m.netSavings).toBeNull();
  });

  it("a null income with real expenses is still unknown", () => {
    const m = monthlyMoney({ income: null, expenses: 912.5 });
    expect(m.income).toBeNull();
    expect(m.expenses).toBe(912.5);
    expect(m.savingsRate).toBeNull();
  });

  it("null expenses withhold the rate rather than treating spend as zero", () => {
    const m = monthlyMoney({ income: 1250, expenses: null });
    expect(m.income).toBe(1250);
    expect(m.savingsRate).toBeNull();
    expect(m.netSavings).toBeNull();
  });

  it("the rate is (income - expenses) / income, signed", () => {
    // The seeded persona's own month: it overspent, so the rate is negative.
    // A surface showing +2.5% for this month is showing the magnitude.
    const over = monthlyMoney({ income: 1250, expenses: 1281.03 });
    expect(over.netSavings).toBe(-31.03);
    expect(over.savingsRate).toBe(-2.48);

    const under = monthlyMoney({ income: 2000, expenses: 1600 });
    expect(under.netSavings).toBe(400);
    expect(under.savingsRate).toBe(20);
  });

  it("a negative income is not treated as income", () => {
    expect(monthlyMoney({ income: -500, expenses: 100 }).income).toBeNull();
  });

  it("hasRecordedIncome agrees with the income it returns", () => {
    expect(hasRecordedIncome({ income: 1250, expenses: 0 })).toBe(true);
    expect(hasRecordedIncome({ income: 0, expenses: 400 })).toBe(false);
    expect(hasRecordedIncome(null)).toBe(false);
  });

  it("the stated unknown is a dash, not an empty string", () => {
    // Every surface renders this constant. An empty cell reads as a layout
    // bug; a dash reads as "we do not know", which is the claim being made.
    expect(UNKNOWN_FIGURE).toBe("—");
    expect(UNKNOWN_FIGURE.trim().length).toBeGreaterThan(0);
  });
});

describe("recordedAnnualIncome — what /tax may assume", () => {
  it("no earning month means no assumption", () => {
    expect(recordedAnnualIncome(null)).toBeNull();
    expect(recordedAnnualIncome([])).toBeNull();
    expect(recordedAnnualIncome([{ income: null }, { income: 0 }])).toBeNull();
  });

  it("annualises the mean of the months that recorded income, and says how many", () => {
    const r = recordedAnnualIncome([
      { income: 1250 },
      { income: 1250 },
      { income: null },
      { income: 0 },
      { income: 1250 },
    ]);
    expect(r).not.toBeNull();
    expect(r!.months).toBe(3);
    expect(r!.total).toBe(3750);
    expect(r!.annual).toBe(15000);
  });

  it("months with no income do not dilute the annualised figure to zero", () => {
    // £3,750 over three recorded months is £15,000/yr. Dividing by six
    // calendar months instead would state £7,500 — an understatement
    // presented with the same confidence.
    const r = recordedAnnualIncome([{ income: 3750 }, { income: null }]);
    expect(r!.annual).toBe(45000);
  });
});

// ── PART B: the source lock ──────────────────────────────────────────────────

// The four surfaces item 10 names. Each must read the shared definition.
const SURFACES = [
  "pages/dashboard.tsx",
  "pages/analytics.tsx",
  "pages/cashflow.tsx",
  "pages/whatif.tsx",
] as const;

function read(rel: string): string {
  return readFileSync(join(SRC, rel), "utf8");
}

// Comments quote the defect they fixed, including the old expressions. A
// scanner that reads them finds the pattern it is meant to forbid in the
// explanation of why it is forbidden.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

describe("every surface that shows a monthly figure calls the one definition", () => {
  for (const rel of SURFACES) {
    it(`${rel} imports monthly-money and calls monthlyMoney()`, () => {
      const text = stripComments(read(rel));
      expect(text).toMatch(/from\s+"@\/lib\/monthly-money"/);
      expect(text).toMatch(/\bmonthlyMoney\s*\(/);
    });

    it(`${rel} does not read thisMonth.income or thisMonth.savingsRate directly`, () => {
      const text = stripComments(read(rel));
      const direct = text.match(
        /thisMonth\s*\??\.\s*(income|expenses|savingsRate|netSavings)/g,
      );
      expect(direct ?? []).toEqual([]);
    });
  }

  it("the definition lives in exactly one file", () => {
    // The formula, not the word. Any second site computing
    // (income - expenses) / income is a second definition.
    const formula = /\(\s*income\s*-\s*expenses\s*\)\s*\/\s*income/;
    const owner = read("lib/monthly-money.ts");
    expect(owner).toMatch(formula);
    for (const rel of SURFACES) {
      expect(stripComments(read(rel))).not.toMatch(formula);
    }
  });
});
