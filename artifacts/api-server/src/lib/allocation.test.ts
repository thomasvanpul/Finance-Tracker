// The allocation engine. Pure — no DB, FX injected.
//
// Three of these are properties rather than examples, because the failure
// mode that matters is not "the arithmetic is off by a penny", it is "the
// number moved in the wrong DIRECTION". A safe-to-spend that goes UP when
// you commit more money, or when the ledger stops explaining your balance,
// is worse than no feature: the user acts on it.

import { describe, it, expect } from "vitest";
import {
  computeAllocation,
  goalClaim,
  driftReduction,
  daysBetween,
  addDays,
  HORIZON_DAYS,
  MIN_DRIFT_DAYS,
  type AllocationInput,
  type AllocationUpcomingInput,
  type AllocationGoalInput,
} from "./allocation";

const TODAY = "2026-09-11";

// GBP base. EUR converts, MYR does not — the standing shape of an FX
// outage in this repo, where toBase returns null rather than passing the
// native figure through (market.ts:230-241).
const fx: AllocationInput["convert"] = async (amount, from, to) => {
  if (from === to) return amount;
  if (from === "EUR" && to === "GBP") return amount * 0.86;
  if (from === "GBP" && to === "EUR") return amount / 0.86;
  return null;
};

const identityFx: AllocationInput["convert"] = async (amount) => amount;

function upcoming(over: Partial<AllocationUpcomingInput> = {}): AllocationUpcomingInput {
  return {
    id: 1,
    dueDate: "2026-09-20",
    description: "thing",
    type: "expense",
    nativeAmount: 100,
    currency: "GBP",
    ...over,
  };
}

function goal(over: Partial<AllocationGoalInput> = {}): AllocationGoalInput {
  return {
    id: 1,
    name: "Deposit",
    target: 1000,
    current: 0,
    deadline: null,
    monthlyContribution: null,
    ...over,
  };
}

function input(over: Partial<AllocationInput> = {}): AllocationInput {
  return {
    today: TODAY,
    baseCurrency: "GBP",
    cashAccounts: [{ id: 1, name: "Current", currency: "GBP", balance: 3000 }],
    upcoming: [],
    goals: [],
    drift: { status: "ok", gapBase: 0, days: 10, periodFrom: "2026-09-01" },
    convert: identityFx,
    ...over,
  };
}

describe("date helpers", () => {
  it("counts days forward", () => {
    expect(daysBetween("2026-09-11", "2026-10-11")).toBe(30);
  });

  it("counts days backward as negative", () => {
    expect(daysBetween("2026-09-11", "2026-09-01")).toBe(-10);
  });

  // The one arithmetic that a Date-arithmetic bug hides in. 2026 is not a
  // leap year; the window from 28 Feb must land on 30 March.
  it("crosses a month boundary", () => {
    expect(addDays("2026-02-28", 30)).toBe("2026-03-30");
  });

  it("crosses a year boundary", () => {
    expect(addDays("2026-12-20", 30)).toBe("2027-01-19");
  });
});

describe("computeAllocation — the number", () => {
  it("spreads cash over the window when nothing else is known to claim it", async () => {
    const r = await computeAllocation(input());
    expect(r.status).toBe("ok");
    // 3000 / 30
    expect(r.dailyAllowance).toBe(100);
    expect(r.availableNow).toBe(3000);
    expect(r.committedOut).toBe(0);
    expect(r.expectedIncome).toBe(0);
    expect(r.goalClaim).toBe(0);
    expect(r.driftReduction).toBe(0);
  });

  it("subtracts a committed outgoing", async () => {
    const r = await computeAllocation(input({ upcoming: [upcoming({ nativeAmount: 300 })] }));
    expect(r.committedOut).toBe(300);
    expect(r.dailyAllowance).toBe(90); // (3000 - 300) / 30
  });

  it("adds dated expected income", async () => {
    const r = await computeAllocation(input({
      upcoming: [upcoming({ type: "income", nativeAmount: 600 })],
    }));
    expect(r.expectedIncome).toBe(600);
    expect(r.dailyAllowance).toBe(120); // (3000 + 600) / 30
  });

  it("ignores obligations outside the window on both ends", async () => {
    const r = await computeAllocation(input({
      upcoming: [
        upcoming({ id: 1, dueDate: "2026-09-10", nativeAmount: 500 }), // yesterday
        upcoming({ id: 2, dueDate: "2026-10-12", nativeAmount: 500 }), // day 31
        upcoming({ id: 3, dueDate: "2026-10-11", nativeAmount: 100 }), // day 30, in
      ],
    }));
    expect(r.upcomingCounted).toBe(1);
    expect(r.committedOut).toBe(100);
  });

  it("converts a foreign obligation before folding it", async () => {
    const r = await computeAllocation(input({
      upcoming: [upcoming({ nativeAmount: 100, currency: "EUR" })],
      convert: fx,
    }));
    expect(r.committedOut).toBe(86);
  });

  it("counts only cash accounts it was given, converted", async () => {
    const r = await computeAllocation(input({
      cashAccounts: [
        { id: 1, name: "Current", currency: "GBP", balance: 1000 },
        { id: 2, name: "Euro", currency: "EUR", balance: 1000 },
      ],
      convert: fx,
    }));
    expect(r.availableNow).toBe(1860);
    expect(r.cashAccountsCounted).toBe(2);
  });

  it("can go negative when commitments exceed what is available", async () => {
    const r = await computeAllocation(input({
      upcoming: [upcoming({ nativeAmount: 6000 })],
    }));
    // Not clamped to zero. "You are £100/day overcommitted" is the true
    // statement; a floor at 0 would say "you have nothing spare", which is
    // a materially weaker and more comfortable claim than the facts.
    expect(r.dailyAllowance).toBe(-100);
  });
});

describe("computeAllocation — an unknown leg makes the total unknown", () => {
  it("withholds the number when a cash balance cannot be converted", async () => {
    const r = await computeAllocation(input({
      cashAccounts: [
        { id: 1, name: "Current", currency: "GBP", balance: 3000 },
        { id: 2, name: "Maybank", currency: "MYR", balance: 5000 },
      ],
      convert: fx,
    }));
    expect(r.status).toBe("unknown");
    expect(r.dailyAllowance).toBeNull();
    expect(r.availableNow).toBeNull();
    expect(r.blockers).toContain("cash-unconvertible");
    expect(r.cashAccountsUnconvertible).toBe(1);
  });

  // The specific bug this rule exists to prevent: /upcoming/summary at
  // upcoming.ts:91 skips an unconvertible row and returns the reduced total
  // with no marker, so "£0 owed" and "£800 owed, unconvertible" render
  // identically. Here the total is withheld instead.
  it("withholds the number when an obligation cannot be converted", async () => {
    const r = await computeAllocation(input({
      upcoming: [upcoming({ nativeAmount: 800, currency: "MYR" })],
      convert: fx,
    }));
    expect(r.status).toBe("unknown");
    expect(r.dailyAllowance).toBeNull();
    expect(r.committedOut).toBeNull();
    expect(r.blockers).toContain("upcoming-unconvertible");
    expect(r.upcomingUnconvertible).toBe(1);
  });

  it("withholds the number when there is not enough snapshot history to measure drift", async () => {
    const r = await computeAllocation(input({
      drift: { status: "insufficient", gapBase: null, days: 0, periodFrom: null },
    }));
    expect(r.status).toBe("unknown");
    expect(r.dailyAllowance).toBeNull();
    expect(r.blockers).toContain("drift-insufficient-history");
    // The legs that ARE known are still reported — the caller can say what
    // is missing rather than showing a shrug.
    expect(r.availableNow).toBe(3000);
    expect(r.committedOut).toBe(0);
  });

  it("withholds the number when the user holds no cash account", async () => {
    const r = await computeAllocation(input({ cashAccounts: [] }));
    expect(r.status).toBe("unknown");
    expect(r.dailyAllowance).toBeNull();
    expect(r.blockers).toContain("no-cash-accounts");
  });

  it("offers no partial figure to fall back to", async () => {
    const r = await computeAllocation(input({
      drift: { status: "insufficient", gapBase: null, days: 0, periodFrom: null },
    }));
    // There is exactly one allowance field on the result, and it is null.
    // A `dailyAllowanceBeforeDrift` would be rendered by the first caller
    // that wanted a number, which is the whole failure being prevented.
    const allowanceKeys = Object.keys(r).filter((k) => /allowance/i.test(k));
    expect(allowanceKeys).toEqual(["dailyAllowance"]);
  });
});

describe("goalClaim", () => {
  it("claims remaining over days until the deadline", async () => {
    const c = goalClaim(goal({ target: 900, current: 0, deadline: "2026-12-10" }), TODAY, 30);
    expect(c).not.toBeNull();
    expect(c!.daysRemaining).toBe(90);
    expect(c!.perDay).toBeCloseTo(10, 10);
    expect(c!.claimedOverWindow).toBeCloseTo(300, 10);
    expect(c!.basis).toBe("deadline");
  });

  it("claims only the shortfall, not the target", async () => {
    const c = goalClaim(goal({ target: 900, current: 600, deadline: "2026-12-10" }), TODAY, 30);
    expect(c!.remaining).toBe(300);
    expect(c!.perDay).toBeCloseTo(300 / 90, 10);
  });

  it("claims nothing for a goal already met", () => {
    expect(goalClaim(goal({ target: 900, current: 900, deadline: "2026-12-10" }), TODAY, 30)).toBeNull();
  });

  it("never claims beyond the goal when the deadline is inside the window", () => {
    const c = goalClaim(goal({ target: 300, current: 0, deadline: "2026-09-21" }), TODAY, 30);
    // 10 days out, 30-day window: claim the goal, not three times it.
    expect(c!.claimedOverWindow).toBeCloseTo(300, 10);
  });

  // A missed savings deadline must not hand back an allowance INCREASE,
  // which is what remaining / negativeDays would do.
  it("claims the whole remainder for an overdue goal, and never a negative", () => {
    const c = goalClaim(goal({ target: 900, current: 100, deadline: "2026-09-01" }), TODAY, 30);
    expect(c!.daysRemaining).toBe(-10);
    expect(c!.perDay).toBe(800);
    expect(c!.claimedOverWindow).toBe(800);
  });

  it("falls back to a stated monthly contribution when there is no deadline", () => {
    const c = goalClaim(goal({ target: 5000, current: 0, monthlyContribution: 300 }), TODAY, 30);
    expect(c!.basis).toBe("monthly-contribution");
    expect(c!.perDay).toBeCloseTo(300 / (365.25 / 12), 10);
  });

  it("claims nothing when there is neither a deadline nor a contribution", () => {
    expect(goalClaim(goal({ target: 5000, current: 0 }), TODAY, 30)).toBeNull();
  });

  // goals.deadline is text (schema/goals.ts:15), not a date column, and
  // routes/goals.ts:52 writes whatever string arrives. A goal whose
  // deadline is "someday" must not be parsed into NaN days and poison the
  // total; it is treated as undated.
  it("treats an unparseable deadline as undated rather than as NaN", () => {
    expect(goalClaim(goal({ deadline: "someday" }), TODAY, 30)).toBeNull();
    const c = goalClaim(goal({ deadline: "next year", monthlyContribution: 100 }), TODAY, 30);
    expect(c!.basis).toBe("monthly-contribution");
  });

  it("is folded into the allowance and counted in the decomposition", async () => {
    const r = await computeAllocation(input({
      goals: [
        goal({ id: 1, target: 900, current: 0, deadline: "2026-12-10" }), // 300 over window
        goal({ id: 2, target: 100, current: 100 }),                       // met
        goal({ id: 3, target: 500, current: 0 }),                         // no basis
      ],
    }));
    expect(r.goalClaim).toBe(300);
    expect(r.goalClaims).toHaveLength(1);
    expect(r.goalsWithoutClaim).toBe(2);
    expect(r.dailyAllowance).toBe(90); // (3000 - 300) / 30
  });
});

describe("driftReduction", () => {
  it("turns an unexplained outflow into a reduction over the window", () => {
    // £40 unaccounted over 20 days = £2/day = £60 over 30 days.
    expect(driftReduction(-40, 20, 30)).toBeCloseTo(60, 10);
  });

  // The asymmetry is the point. Unexplained money ARRIVING is not headroom
  // — a mis-keyed balance looks exactly the same — and honouring it would
  // make the number more optimistic on worse data.
  it("ignores an unexplained inflow", () => {
    expect(driftReduction(40, 20, 30)).toBe(0);
  });

  it("is zero when no days were observed", () => {
    expect(driftReduction(-40, 0, 30)).toBe(0);
  });

  it("reduces the allowance, and says by how much", async () => {
    const r = await computeAllocation(input({
      drift: { status: "ok", gapBase: -40, days: 20, periodFrom: "2026-08-22" },
    }));
    expect(r.driftReduction).toBe(60);
    expect(r.driftPerDay).toBe(-2);
    expect(r.dailyAllowance).toBe(98); // (3000 - 60) / 30
  });
});

// ---------------------------------------------------------------------------
// Properties. Deterministic generators — a seeded LCG rather than a random
// one, so a failure is reproducible from the seed printed in the test name
// and a green run means the same thing twice.
// ---------------------------------------------------------------------------

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1_664_525 + 1_013_904_223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

const CASES = 200;

describe("properties", () => {
  it("more committed outgoing never increases the allowance", async () => {
    const rand = lcg(20260911);
    for (let i = 0; i < CASES; i++) {
      const base = input({
        cashAccounts: [{ id: 1, name: "C", currency: "GBP", balance: Math.round(rand() * 20_000) }],
        upcoming: [upcoming({ id: 1, nativeAmount: Math.round(rand() * 500) })],
        drift: { status: "ok", gapBase: -Math.round(rand() * 100), days: 15, periodFrom: "2026-08-27" },
      });
      const extra = Math.round(rand() * 900) + 1;
      const before = await computeAllocation(base);
      const after = await computeAllocation({
        ...base,
        upcoming: [...base.upcoming, upcoming({ id: 2, dueDate: "2026-09-25", nativeAmount: extra })],
      });
      expect(after.dailyAllowance!).toBeLessThanOrEqual(before.dailyAllowance!);
    }
  });

  it("a goal with a nearer deadline never claims less per day", async () => {
    const rand = lcg(4242);
    for (let i = 0; i < CASES; i++) {
      const target = Math.round(rand() * 5_000) + 100;
      const current = Math.round(rand() * target);
      const farDays = Math.round(rand() * 300) + 31;
      const nearDays = Math.max(1, Math.round(rand() * farDays));
      const far = goalClaim(goal({ target, current, deadline: addDays(TODAY, farDays) }), TODAY, HORIZON_DAYS);
      const near = goalClaim(goal({ target, current, deadline: addDays(TODAY, nearDays) }), TODAY, HORIZON_DAYS);
      if (far == null || near == null) continue; // goal already met
      expect(near.perDay).toBeGreaterThanOrEqual(far.perDay);
      // And a nearer goal never leaves MORE spendable.
      expect(near.claimedOverWindow).toBeGreaterThanOrEqual(far.claimedOverWindow - 1e-9);
    }
  });

  it("drift only ever reduces the allowance, never raises it", async () => {
    const rand = lcg(31337);
    for (let i = 0; i < CASES; i++) {
      const days = Math.round(rand() * 60) + 1;
      const gap = (rand() - 0.5) * 2_000;
      const base = input({
        cashAccounts: [{ id: 1, name: "C", currency: "GBP", balance: Math.round(rand() * 20_000) }],
        drift: { status: "ok", gapBase: 0, days, periodFrom: "2026-08-01" },
      });
      const noDrift = await computeAllocation(base);
      const withDrift = await computeAllocation({
        ...base,
        drift: { status: "ok", gapBase: gap, days, periodFrom: "2026-08-01" },
      });

      // `days` is drawn from [1, 60], which straddles MIN_DRIFT_DAYS. Both
      // sides of the floor are asserted rather than narrowing the draw:
      // below it the figure is withheld whatever the gap, which is the
      // stronger statement, and above it the original property holds.
      if (days < MIN_DRIFT_DAYS) {
        expect(withDrift.dailyAllowance).toBeNull();
        expect(noDrift.dailyAllowance).toBeNull();
        expect(withDrift.driftReduction).toBeNull();
        expect(withDrift.blockers).toContain("drift-insufficient-history");
        continue;
      }
      expect(withDrift.dailyAllowance!).toBeLessThanOrEqual(noDrift.dailyAllowance! + 1e-9);
      expect(withDrift.driftReduction!).toBeGreaterThanOrEqual(0);
    }
  });

  it("an unconvertible leg always withholds the number, whatever else is true", async () => {
    const rand = lcg(777);
    for (let i = 0; i < CASES; i++) {
      const r = await computeAllocation(input({
        cashAccounts: [
          { id: 1, name: "C", currency: "GBP", balance: Math.round(rand() * 20_000) },
          { id: 2, name: "M", currency: "MYR", balance: Math.round(rand() * 20_000) },
        ],
        upcoming: [upcoming({ nativeAmount: Math.round(rand() * 500) })],
        goals: [goal({ target: Math.round(rand() * 5_000), deadline: addDays(TODAY, 60) })],
        drift: { status: "ok", gapBase: -Math.round(rand() * 100), days: 15, periodFrom: "2026-08-27" },
        convert: fx,
      }));
      expect(r.status).toBe("unknown");
      expect(r.dailyAllowance).toBeNull();
    }
  });
});

// ── The drift floor ─────────────────────────────────────────────────────────
//
// driftReduction extrapolates gapBase/days across a 30-day horizon, so a
// four-day sample is amplified 7.5x. Before MIN_DRIFT_DAYS, the only bar was
// computeReconciliation's — one complete baseline date strictly before today
// (reconciliation.ts:169-171) — so a ONE-day sample was projected 30x. On the
// seed account, measured 2026-09-11, driftDays was 4, and snapshots cannot be
// backfilled, so every real user meets this on day five.

describe("MIN_DRIFT_DAYS floor", () => {
  const base = {
    today: "2026-09-11",
    baseCurrency: "GBP",
    cashAccounts: [{ id: 1, name: "Monzo", currency: "GBP", balance: 3000 }],
    upcoming: [],
    goals: [],
    convert: async (amount: number) => amount,
  };

  it("is 7, and that is the number the reasoning in allocation.ts argues for", () => {
    expect(MIN_DRIFT_DAYS).toBe(7);
  });

  it("withholds the whole figure below the floor — no drift-free allowance", async () => {
    // The tempting wrong answer is to drop the drift term and hand back the
    // other four legs. That is a partial figure presented as a total, and it
    // errs OPTIMISTIC, which is the direction that costs a user money.
    const r = await computeAllocation({
      ...base,
      drift: { status: "ok", gapBase: -40, days: 4, periodFrom: "2026-09-07" },
    });
    expect(r.dailyAllowance).toBeNull();
    expect(r.status).toBe("unknown");
    expect(r.blockers).toContain("drift-insufficient-history");
  });

  it("does not let a rate extrapolated from four days reach the response", async () => {
    // -40 over 4 days is -10/day, which the old code projected to -300 across
    // the window off a single event. driftPerDay is the extrapolation and is
    // withheld; the observed gap and the day count are facts and are kept, so
    // a surface can say "4 days of history, 7 needed" without inventing a rate.
    const r = await computeAllocation({
      ...base,
      drift: { status: "ok", gapBase: -40, days: 4, periodFrom: "2026-09-07" },
    });
    expect(r.driftPerDay).toBeNull();
    expect(r.driftReduction).toBeNull();
    expect(r.driftGapBase).toBe(-40);
    expect(r.driftDays).toBe(4);
  });

  it("applies at exactly 7 days and not at 6 — the boundary is inclusive", async () => {
    const at6 = await computeAllocation({
      ...base, drift: { status: "ok", gapBase: -70, days: 6, periodFrom: "2026-09-05" },
    });
    const at7 = await computeAllocation({
      ...base, drift: { status: "ok", gapBase: -70, days: 7, periodFrom: "2026-09-04" },
    });
    expect(at6.dailyAllowance).toBeNull();
    expect(at6.blockers).toContain("drift-insufficient-history");
    expect(at7.dailyAllowance).not.toBeNull();
    expect(at7.blockers).not.toContain("drift-insufficient-history");
    expect(at7.driftReduction).toBeCloseTo(300, 2); // 70/7 = 10/day over 30 days
  });

  it("still blocks when there is no history at all, as it always did", async () => {
    const r = await computeAllocation({
      ...base, drift: { status: "insufficient", gapBase: null, days: 0, periodFrom: null },
    });
    expect(r.dailyAllowance).toBeNull();
    expect(r.blockers).toContain("drift-insufficient-history");
  });

  it("reports one blocker, not two, when the sample is short AND unconvertible", async () => {
    // Short-sample is checked first and short-circuits, so a user is told the
    // one thing that is actionable: wait for more history.
    const r = await computeAllocation({
      ...base, drift: { status: "ok", gapBase: null, days: 3, periodFrom: "2026-09-08" },
    });
    expect(r.blockers.filter((b) => b.startsWith("drift-"))).toEqual(["drift-insufficient-history"]);
  });

  it("does not withhold anything above the floor, including a zero gap", async () => {
    const r = await computeAllocation({
      ...base, drift: { status: "ok", gapBase: 0, days: 30, periodFrom: "2026-08-12" },
    });
    expect(r.blockers).not.toContain("drift-insufficient-history");
    expect(r.driftReduction).toBe(0);
    expect(r.driftPerDay).toBe(0);
    expect(r.dailyAllowance).not.toBeNull();
  });
});
