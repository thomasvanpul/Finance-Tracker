import { describe, it, expect } from "vitest";
import type { AllocationResult } from "@workspace/api-client-react";
import {
  allowanceState,
  contributionGap,
  goalClaimViews,
  ordinalDay,
  waitingLine,
} from "@/lib/allocation-view";

// The rule these defend, in one line: the screen states what the engine
// measured and nothing else. No provisional figure below the drift floor, no
// promised date the data cannot support, and no per-day rate on a claim that
// is not per-day.

const BASE: AllocationResult = {
  status: "unknown",
  blockers: [],
  baseCurrency: "GBP",
  today: "2026-09-11",
  horizonDays: 30,
  windowEnd: "2026-10-11",
  dailyAllowance: null,
  availableNow: 11375.19,
  expectedIncome: 0,
  committedOut: 1228.13,
  goalClaim: 3435.19,
  driftReduction: null,
  goalClaims: [],
  goalsWithoutClaim: 2,
  cashAccountsCounted: 4,
  cashAccountsUnconvertible: 0,
  upcomingCounted: 7,
  upcomingUnconvertible: 0,
  driftGapBase: 0,
  driftPerDay: null,
  driftDays: 4,
  minDriftDays: 7,
} as AllocationResult;

describe("allowanceState", () => {
  it("gives the figure when the engine gave one", () => {
    const s = allowanceState({ ...BASE, status: "ok", dailyAllowance: 223.73 });
    expect(s).toEqual({ kind: "figure", value: 223.73 });
  });

  it("names the wait, its length and the day it ends", () => {
    // The state every real account is in for its first week. driftDays 4,
    // floor 7, so three more days: the 14th.
    const s = allowanceState({ ...BASE, blockers: ["drift-insufficient-history"] });
    expect(s).toEqual({ kind: "waiting", daysSoFar: 4, daysNeeded: 7, resolvesOn: "2026-09-14" });
    expect(waitingLine(s as never)).toBe(
      "4 of 7 days of history — your allowance appears on the 14th");
  });

  it("carries no number in the waiting state — not zero, not a partial", () => {
    const s = allowanceState({ ...BASE, blockers: ["drift-insufficient-history"] });
    expect(s).not.toHaveProperty("value");
    // The legs that WERE computed stay in the response and must not be
    // recombined here: availableNow − committedOut − goalClaim over the
    // window is precisely the drift-free allowance the engine withholds.
    expect(JSON.stringify(s)).not.toContain("11375");
  });

  it("promises no date when there is no run of history to project from", () => {
    // reconciliation reports days 0 when it found no complete baseline at
    // all (reconciliation.ts:162). Nothing is climbing, so nothing is
    // promised.
    const s = allowanceState({ ...BASE, blockers: ["drift-insufficient-history"], driftDays: 0 });
    expect(s).toMatchObject({ kind: "waiting", resolvesOn: null });
    expect(waitingLine(s as never)).toBe(
      "0 of 7 days of history — your allowance appears once there is a week of it");
  });

  it("reads the floor from the response rather than a copy of its own", () => {
    const s = allowanceState({
      ...BASE, blockers: ["drift-insufficient-history"], driftDays: 4, minDriftDays: 14,
    });
    expect(s).toMatchObject({ daysNeeded: 14, resolvesOn: "2026-09-21" });
  });

  it("states the blocker a user can act on today, not the one that self-heals", () => {
    const s = allowanceState({
      ...BASE, blockers: ["drift-insufficient-history", "no-cash-accounts"],
    });
    expect(s).toMatchObject({ kind: "blocked" });
    expect((s as { reason: string }).reason).toMatch(/No cash account/);
  });

  it("never returns a bare shrug for an unrecognised blocker", () => {
    const s = allowanceState({ ...BASE, blockers: ["something-new"] as never });
    expect(s).toMatchObject({ kind: "blocked" });
    expect((s as { reason: string }).reason.length).toBeGreaterThan(0);
  });
});

describe("ordinalDay", () => {
  it.each([
    ["2026-09-01", "the 1st"],
    ["2026-09-02", "the 2nd"],
    ["2026-09-03", "the 3rd"],
    ["2026-09-04", "the 4th"],
    ["2026-09-11", "the 11th"],
    ["2026-09-12", "the 12th"],
    ["2026-09-13", "the 13th"],
    ["2026-09-21", "the 21st"],
    ["2026-09-22", "the 22nd"],
    ["2026-09-23", "the 23rd"],
  ])("%s → %s", (iso, expected) => {
    expect(ordinalDay(iso)).toBe(expected);
  });
});

describe("goalClaimViews", () => {
  const claims = [
    { id: 22, name: "Emergency Fund", remaining: 3900, deadline: "2027-03-06", daysRemaining: 176, perDay: 22.16, claimedOverWindow: 664.77, basis: "deadline" },
    { id: 27, name: "Wedding Gift", remaining: 580, deadline: "2026-08-29", daysRemaining: -13, perDay: 580, claimedOverWindow: 580, basis: "deadline" },
    { id: 23, name: "Japan Trip", remaining: 2300, deadline: "2027-05-05", daysRemaining: 236, perDay: 9.75, claimedOverWindow: 292.37, basis: "deadline" },
  ];
  const goals = [
    { id: 22, monthlyContribution: "500" },
    { id: 27, monthlyContribution: null },
    { id: 23, monthlyContribution: null },
  ];

  it("shows both figures where a deadline beats a stated contribution", () => {
    const [emergency] = goalClaimViews({ ...BASE, goalClaims: claims } as never, goals);
    expect(emergency.statedMonthly).toBe(500);
    // 22.16/day × 365.25/12 — the engine's own DAYS_PER_MONTH, so the
    // monthly figure stated here is the one it divided.
    expect(emergency.deadlineNeedsMonthly).toBeCloseTo(674.5, 1);
    expect(contributionGap(emergency)).toEqual({ stated: 500, needed: emergency.deadlineNeedsMonthly });
  });

  it("marks an overdue goal and offers no monthly rate for it", () => {
    const wedding = goalClaimViews({ ...BASE, goalClaims: claims } as never, goals)[1];
    expect(wedding.overdue).toBe(true);
    expect(wedding.daysOverdue).toBe(13);
    // perDay IS the whole remainder for an overdue goal. Presenting it as a
    // monthly rate would multiply a one-off lump by 30.
    expect(wedding.deadlineNeedsMonthly).toBeNull();
    expect(contributionGap(wedding)).toBeNull();
  });

  it("says nothing where the user stated no contribution to disagree with", () => {
    const japan = goalClaimViews({ ...BASE, goalClaims: claims } as never, goals)[2];
    expect(japan.statedMonthly).toBeNull();
    expect(contributionGap(japan)).toBeNull();
  });

  it("treats a sub-£1 difference as agreement, not as a disagreement", () => {
    const [g] = goalClaimViews(
      { ...BASE, goalClaims: [{ ...claims[0], perDay: 500 / (365.25 / 12) }] } as never,
      [{ id: 22, monthlyContribution: 500 }],
    );
    expect(contributionGap(g)).toBeNull();
  });
});
