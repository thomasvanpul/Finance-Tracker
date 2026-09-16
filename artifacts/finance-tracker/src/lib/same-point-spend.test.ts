import { describe, expect, it } from "vitest";
import { sameDayInPrevMonth, sameDayLabel, samePointSpend, ymd } from "./same-point-spend";

// The seed account's real August expenses, as queried from the dev branch on
// 2026-09-16: 14 rows, £1,325.81 in total against the stored
// native_to_base_rate. The first seven fall on or before the 16th.
const AUGUST = [
  { type: "expense", date: "2026-08-04", baseEquivalent: -45.6 },
  { type: "expense", date: "2026-08-07", baseEquivalent: -2.27175 },
  { type: "expense", date: "2026-08-08", baseEquivalent: -3.85 },
  { type: "expense", date: "2026-08-11", baseEquivalent: -15.2558 },
  { type: "expense", date: "2026-08-12", baseEquivalent: -890 },
  { type: "expense", date: "2026-08-15", baseEquivalent: -51.2 },
  { type: "expense", date: "2026-08-16", baseEquivalent: -3.431106 },
  // ── after the 16th; excluded from a same-point comparison on the 16th ──
  { type: "expense", date: "2026-08-17", baseEquivalent: -63.9 },
  { type: "expense", date: "2026-08-17", baseEquivalent: -179 },
  { type: "expense", date: "2026-08-19", baseEquivalent: -3.85 },
  { type: "expense", date: "2026-08-22", baseEquivalent: -19.75 },
  { type: "expense", date: "2026-08-23", baseEquivalent: -35.1 },
  { type: "expense", date: "2026-08-27", baseEquivalent: -8.75 },
  { type: "expense", date: "2026-08-30", baseEquivalent: -3.85 },
];

const SEPTEMBER = [
  { type: "expense", date: "2026-09-01", baseEquivalent: -14.2 },
  { type: "expense", date: "2026-09-03", baseEquivalent: -22.4 },
  { type: "expense", date: "2026-09-05", baseEquivalent: -3.85 },
];

describe("samePointSpend", () => {
  it("compares the same span of each month, not a part-month against a whole one", () => {
    const now = new Date(2026, 8, 16); // 16 Sep 2026, local
    const r = samePointSpend([...SEPTEMBER, ...AUGUST], now);

    expect(r.mtd).toBeCloseTo(40.45, 2);
    // 1-16 August only. The full month is 1,325.81; comparing against that is
    // the defect this module exists to remove.
    expect(r.lastMonthSamePoint).toBeCloseTo(1011.61, 2);
    expect(r.sameDayLastIso).toBe("2026-08-16");
  });

  it("ignores rows outside both windows", () => {
    const now = new Date(2026, 8, 16);
    const withJuly = [
      ...SEPTEMBER,
      ...AUGUST,
      { type: "expense", date: "2026-07-31", baseEquivalent: -9.1 },
    ];
    const r = samePointSpend(withJuly, now);
    // The 9.10 of 31 July is exactly what the old UTC-derived window folded
    // into "last month". It must not reach either side.
    expect(r.lastMonthSamePoint).toBeCloseTo(1011.61, 2);
  });

  it("excludes rows dated later this month than today", () => {
    const now = new Date(2026, 8, 16);
    const withFuture = [...SEPTEMBER, { type: "expense", date: "2026-09-28", baseEquivalent: -500 }];
    expect(samePointSpend(withFuture, now).mtd).toBeCloseTo(40.45, 2);
  });

  it("counts only expenses", () => {
    const now = new Date(2026, 8, 16);
    const withIncome = [...SEPTEMBER, { type: "income", date: "2026-09-02", baseEquivalent: 2400 }];
    expect(samePointSpend(withIncome, now).mtd).toBeCloseTo(40.45, 2);
  });

  it("nulls a side when any row in it could not be converted to base", () => {
    const now = new Date(2026, 8, 16);
    const r = samePointSpend(
      [...SEPTEMBER, { type: "expense", date: "2026-09-04", baseEquivalent: null }, ...AUGUST],
      now,
    );
    // Unknown, not understated. A partial sum renders identically to a real
    // one, which is the failure mode CLAUDE.md names first.
    expect(r.mtd).toBeNull();
    // The other window is unaffected — one bad row does not erase both sides.
    expect(r.lastMonthSamePoint).toBeCloseTo(1011.61, 2);
  });

  it("honours the skip predicate (the phone's optimistic deletes)", () => {
    const now = new Date(2026, 8, 16);
    const rows = SEPTEMBER.map((t, i) => ({ ...t, id: i }));
    const r = samePointSpend(rows, now, (t) => t.id === 0);
    expect(r.mtd).toBeCloseTo(40.45 - 14.2, 2);
  });

  it("clamps to the last day of the previous month rather than overflowing", () => {
    // 31 March → 28 February, not 3 March. Overflow would compare 31 March
    // with 3 May, which is not the same point.
    expect(ymd(sameDayInPrevMonth(new Date(2026, 2, 31)))).toBe("2026-02-28");
    expect(ymd(sameDayInPrevMonth(new Date(2024, 2, 31)))).toBe("2024-02-29");
    expect(ymd(sameDayInPrevMonth(new Date(2026, 0, 15)))).toBe("2025-12-15");
  });

  it("labels the span the comparison actually used", () => {
    expect(sameDayLabel("2026-08-16")).toBe("16 AUG");
  });
});
