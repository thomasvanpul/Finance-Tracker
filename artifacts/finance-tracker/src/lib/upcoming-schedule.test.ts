import { describe, it, expect } from "vitest";
import {
  comingBills,
  comingIncome,
  daysLabel,
  daysUntil,
  groupUpcoming,
  localYmd,
  overdueOutgoings,
  weekStart,
} from "./upcoming-schedule";

// Sunday 27 Sep 2026, mid-afternoon local time.
const NOW = new Date(2026, 8, 27, 15, 0, 0);

describe("daysLabel", () => {
  it("labels an overdue item by how late it is, never TODAY", () => {
    expect(daysLabel(-15)).toBe("15D LATE");
    expect(daysLabel(-1)).toBe("1D LATE");
  });
  it("keeps TODAY for today only", () => {
    expect(daysLabel(0)).toBe("TODAY");
    expect(daysLabel(1)).toBe("1 DAY");
    expect(daysLabel(12)).toBe("12 DAYS");
  });
});

describe("daysUntil", () => {
  it("counts from the local calendar date", () => {
    expect(daysUntil("2026-09-12", NOW)).toBe(-15);
    expect(daysUntil("2026-09-27", NOW)).toBe(0);
    expect(daysUntil("2026-10-19", NOW)).toBe(22);
  });
  it("uses the local date just after midnight, not the UTC one", () => {
    const justAfterMidnight = new Date(2026, 8, 28, 0, 10, 0);
    expect(localYmd(justAfterMidnight)).toBe("2026-09-28");
    expect(daysUntil("2026-09-28", justAfterMidnight)).toBe(0);
  });
});

describe("weekStart", () => {
  it("returns the Monday, across the October DST change", () => {
    expect(weekStart("2026-09-27")).toBe("2026-09-21");
    expect(weekStart("2026-10-26")).toBe("2026-10-26");
    expect(weekStart("2026-11-01")).toBe("2026-10-26");
  });
});

describe("groupUpcoming", () => {
  const items = [
    { id: 3, dueDate: "2026-10-12" },
    { id: 1, dueDate: "2026-09-12" },
    { id: 2, dueDate: "2026-09-27" },
    { id: 4, dueDate: "2026-09-21" },
  ];
  it("puts past-dated items in one Overdue group ahead of the weeks", () => {
    const groups = groupUpcoming(items, NOW);
    expect(groups.map((g) => g.label)).toEqual(["Overdue", "This week", "12 Oct – 18 Oct"]);
    expect(groups[0]!.overdue).toBe(true);
    expect(groups[0]!.items.map((i) => i.id)).toEqual([1, 4]);
    expect(groups[1]!.items.map((i) => i.id)).toEqual([2]);
  });
  it("has no Overdue group when nothing is late", () => {
    const groups = groupUpcoming([{ dueDate: "2026-09-28" }], NOW);
    expect(groups.map((g) => g.label)).toEqual(["Next week"]);
  });
});

describe("overdueOutgoings", () => {
  const row = (dueDate: string, baseEquivalent: number | null, type = "expense", status = "pending") =>
    ({ dueDate, baseEquivalent, type, status });
  it("sums pending expenses dated before today, to the penny", () => {
    const r = overdueOutgoings([
      row("2026-09-12", 11.99), row("2026-09-13", 890), row("2026-09-27", 2.99),
      row("2026-09-10", 500, "income"), row("2026-09-11", 20, "expense", "paid"),
    ], NOW);
    expect(r).toEqual({ count: 2, total: 901.99 });
  });
  it("gives no total when any overdue row has no base equivalent", () => {
    expect(overdueOutgoings([row("2026-09-12", 11.99), row("2026-09-13", null)], NOW))
      .toEqual({ count: 2, total: null });
  });
});

describe("comingBills", () => {
  it("leaves out bills whose date has passed and keeps the nearest", () => {
    const subs = [
      { id: 1, nextDue: "2026-09-12" },
      { id: 2, nextDue: "2026-10-03" },
      { id: 3, nextDue: "2026-09-27" },
      { id: 4, nextDue: undefined },
      { id: 5, nextDue: "2026-10-01" },
    ];
    expect(comingBills(subs, NOW, 2).map((s) => s.id)).toEqual([3, 5]);
  });
});

describe("comingIncome", () => {
  const item = (id: number, dueDate: string, extra: Partial<{ type: string; status: string }> = {}) =>
    ({ id, dueDate, type: "income", status: "pending", ...extra });

  it("keeps pending income from today to the window's end, nearest first", () => {
    const items = [
      item(1, "2026-10-20"),
      item(2, "2026-09-28"),
      item(3, "2026-09-27"),
      item(4, "2026-09-27", { status: "paid" }),
      item(5, "2026-09-27", { type: "expense" }),
      item(6, "2026-11-30"),
    ];
    expect(comingIncome(items, NOW, 30, 2).map((i) => i.id)).toEqual([3, 2]);
  });

  // The 16 Sep finding: HOME COMING showed 12 and 15 Sept on 16 Sept.
  it("leaves out pending income whose date has passed", () => {
    const items = [item(1, "2026-09-12"), item(2, "2026-09-15"), item(3, "2026-10-02")];
    expect(comingIncome(items, NOW, 30, 2).map((i) => i.id)).toEqual([3]);
  });

  // "Today" is the local date. Just after local midnight east of UTC the UTC
  // date is still yesterday, and just before local midnight west of UTC it is
  // already tomorrow; whichever zone this runs in, one of these straddles it.
  it("leaves out yesterday's income just after local midnight", () => {
    const justAfterMidnight = new Date(2026, 9, 1, 0, 30);
    const items = [item(1, "2026-09-30"), item(2, "2026-10-01")];
    expect(comingIncome(items, justAfterMidnight, 30, 2).map((i) => i.id)).toEqual([2]);
  });

  it("keeps today's income just before local midnight", () => {
    const justBeforeMidnight = new Date(2026, 9, 1, 23, 30);
    const items = [item(1, "2026-10-01"), item(2, "2026-10-02")];
    expect(comingIncome(items, justBeforeMidnight, 30, 2).map((i) => i.id)).toEqual([1, 2]);
  });
});
