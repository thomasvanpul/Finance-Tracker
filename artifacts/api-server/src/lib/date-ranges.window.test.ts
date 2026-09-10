import { describe, it, expect, afterAll } from "vitest";
import { forwardWindow, trailingWindow, localMonthString, localDateString, addCalendarMonths } from "./date-ranges";

// Three implementations of "the next 30 days" were running at once until
// 11-Sep — local+calendar in dashboard.ts, UTC in upcoming.ts, and
// millisecond arithmetic in ai-context.ts. These assertions pin the two
// properties that make them one implementation, and the DST case is the
// one that matters: it is why millisecond arithmetic is WRONG rather than
// merely inelegant.

const ORIGINAL_TZ = process.env.TZ;
function withTZ<T>(tz: string, fn: () => T): T {
  process.env.TZ = tz;
  try { return fn(); } finally { process.env.TZ = ORIGINAL_TZ; }
}
afterAll(() => { process.env.TZ = ORIGINAL_TZ; });

describe("forwardWindow", () => {
  it("uses the LOCAL calendar day, not UTC — the upcoming.ts defect", () => {
    // 2026-09-11 00:24 local at UTC+8 is 2026-09-10 16:24 UTC. That is the
    // exact instant at which /upcoming/summary was measured querying
    // [2026-09-10, 2026-10-10] while /dashboard queried
    // [2026-09-11, 2026-10-11]. A user's "today" is the one on their wall.
    withTZ("Asia/Kuala_Lumpur", () => {
      const anchor = new Date(2026, 8, 11, 0, 24, 0);
      expect(anchor.toISOString().slice(0, 10)).toBe("2026-09-10"); // what UTC says
      expect(forwardWindow(anchor, 30).from).toBe("2026-09-11");    // what the user says
    });
  });

  it("is inclusive at both ends, matching every gte/lte query that reads it", () => {
    withTZ("Europe/London", () => {
      const w = forwardWindow(new Date(2026, 0, 1, 12), 30);
      expect(w).toEqual({ from: "2026-01-01", to: "2026-01-31" });
    });
  });

  it("lands on the same calendar day across a DST change — the millisecond defect", () => {
    // UK clocks go forward on 2026-03-29. Anchored at 23:30 on 2026-03-15,
    // a 30-day window ends on 2026-04-14. Millisecond arithmetic assumes
    // every day is 86,400 seconds, gains the DST hour, crosses midnight and
    // reports 2026-04-15 — one whole day of committed outgoings different,
    // for half the year.
    withTZ("Europe/London", () => {
      const anchor = new Date(2026, 2, 15, 23, 30, 0);
      const msArithmetic = localDateString(new Date(anchor.getTime() + 30 * 86_400_000));

      expect(forwardWindow(anchor, 30).to).toBe("2026-04-14");
      expect(msArithmetic).toBe("2026-04-15");
      expect(forwardWindow(anchor, 30).to).not.toBe(msArithmetic);
    });
  });

  it("also holds across a DST change in the other direction", () => {
    // UK clocks go back on 2026-10-25. Anchored at 00:30 on 2026-10-11, the
    // lost hour pushes millisecond arithmetic back over midnight instead.
    withTZ("Europe/London", () => {
      const anchor = new Date(2026, 9, 11, 0, 30, 0);
      const msArithmetic = localDateString(new Date(anchor.getTime() + 30 * 86_400_000));

      expect(forwardWindow(anchor, 30).to).toBe("2026-11-10");
      expect(msArithmetic).toBe("2026-11-09");
    });
  });

  it("crosses a month and a year boundary without off-by-one", () => {
    withTZ("Europe/London", () => {
      expect(forwardWindow(new Date(2026, 11, 20, 12), 30).to).toBe("2027-01-19");
      expect(forwardWindow(new Date(2028, 1, 1, 12), 30).to).toBe("2028-03-02"); // leap year
    });
  });
});

describe("trailingWindow", () => {
  it("ends on the local day containing the anchor, not the UTC one", () => {
    // digest.ts built its week from a LOCAL midnight Date read back through
    // toISOString(). At UTC+8 local midnight is 16:00 the previous day in
    // UTC, so the digest's "week" was eight days long.
    withTZ("Asia/Kuala_Lumpur", () => {
      const anchor = new Date(2026, 8, 11, 9, 0, 0);
      expect(trailingWindow(anchor, 7)).toEqual({ from: "2026-09-04", to: "2026-09-11" });
    });
  });

  it("spans exactly the requested number of calendar days across DST", () => {
    withTZ("Europe/London", () => {
      expect(trailingWindow(new Date(2026, 3, 5, 0, 30), 7).from).toBe("2026-03-29");
    });
  });
});

describe("localMonthString", () => {
  it("names the local month, not the UTC one", () => {
    withTZ("Asia/Kuala_Lumpur", () => {
      // 1 Sep 2026 00:30 local is 31 Aug 2026 16:30 UTC.
      const anchor = new Date(2026, 8, 1, 0, 30, 0);
      expect(anchor.toISOString().slice(0, 7)).toBe("2026-08");
      expect(localMonthString(anchor)).toBe("2026-09");
    });
  });
});

describe("addCalendarMonths", () => {
  it("is stable in a negative-offset timezone, where a local round-trip is not", () => {
    // The installment generator parsed its start date with new Date(str) —
    // UTC midnight — then shifted it with LOCAL setMonth/getDate. West of
    // Greenwich, UTC midnight is the previous evening, so the round-trip
    // lost a day. This helper never leaves UTC.
    withTZ("America/New_York", () => {
      expect(addCalendarMonths("2026-09-11", 0)).toBe("2026-09-11");
      expect(addCalendarMonths("2026-09-11", 1)).toBe("2026-10-11");
      expect(addCalendarMonths("2026-09-11", 4)).toBe("2027-01-11");
    });
  });

  it("preserves the JS day-overflow the installment generator already had", () => {
    // 31 Jan + 1 month is 3 Mar, not 28 Feb. Clamping is a product decision
    // about what an installment schedule should do, not a timezone fix.
    expect(addCalendarMonths("2026-01-31", 1)).toBe("2026-03-03");
  });
});
