import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { monthRange, trailingMonthRanges, localDateString } from "./date-ranges";

// The bug this exists to prevent lives at positive UTC offsets, where
// `toISOString().slice(0,7)` disagrees with `getMonth()`. Pin the process
// timezone to Asia/Kuala_Lumpur (+08, no DST) so the tests reliably see
// that condition.
const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => { process.env.TZ = "Asia/Kuala_Lumpur"; });
afterAll(() => { process.env.TZ = ORIGINAL_TZ; });

// Guard: some Node builds cache the timezone at startup and ignore later
// process.env.TZ mutations. Skip the suite loudly rather than pass silently.
const tzIsHonoured = new Date(2026, 1, 1).getTimezoneOffset() === -480;

describe.runIf(tzIsHonoured)("date-ranges under +08", () => {
  describe("monthRange", () => {
    it("Feb 1 local produces a February range, not a January-with-Feb-31 range", () => {
      const r = monthRange(new Date(2026, 1, 1));
      expect(r.month).toBe("2026-02");
      expect(r.from).toBe("2026-02-01");
      expect(r.to).toBe("2026-02-28");
    });

    it("handles all 12 month lengths correctly", () => {
      const expected: Array<[number, string]> = [
        [0, "2026-01-31"], [1, "2026-02-28"], [2, "2026-03-31"], [3, "2026-04-30"],
        [4, "2026-05-31"], [5, "2026-06-30"], [6, "2026-07-31"], [7, "2026-08-31"],
        [8, "2026-09-30"], [9, "2026-10-31"], [10, "2026-11-30"], [11, "2026-12-31"],
      ];
      for (const [monthIndex, to] of expected) {
        expect(monthRange(new Date(2026, monthIndex, 15)).to).toBe(to);
      }
    });

    it("leap year — Feb 2024 ends on the 29th", () => {
      expect(monthRange(new Date(2024, 1, 15)).to).toBe("2024-02-29");
    });

    it("last day of month with hours near midnight still resolves the same month", () => {
      // 23:59 local on 2026-08-31 is 15:59 UTC — a naive UTC slice would
      // still print "2026-08", but we don't rely on ISO at all.
      expect(monthRange(new Date(2026, 7, 31, 23, 59)).month).toBe("2026-08");
    });
  });

  describe("trailingMonthRanges", () => {
    it("Aug 15 2026 → six ranges Mar..Aug, every to-date real", () => {
      const ranges = trailingMonthRanges(new Date(2026, 7, 15), 6);
      expect(ranges.map((r) => r.month)).toEqual([
        "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08",
      ]);
      expect(ranges.map((r) => r.to)).toEqual([
        "2026-03-31", "2026-04-30", "2026-05-31", "2026-06-30", "2026-07-31", "2026-08-31",
      ]);
      for (const { to } of ranges) {
        // Every to-date must round-trip through Date without becoming NaN
        // or normalising to a different month.
        const parsed = new Date(`${to}T12:00:00Z`);
        expect(parsed.getTime()).not.toBeNaN();
        expect(to.startsWith(parsed.toISOString().slice(0, 7))).toBe(true);
      }
    });

    it("spans a year boundary correctly", () => {
      const ranges = trailingMonthRanges(new Date(2027, 1, 15), 4);
      expect(ranges.map((r) => r.month)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    });
  });

  describe("localDateString", () => {
    it("returns today's local date even when UTC has already ticked over", () => {
      // 00:30 local on Aug 15 → 16:30 UTC on Aug 14. Local wins.
      expect(localDateString(new Date(2026, 7, 15, 0, 30))).toBe("2026-08-15");
    });
  });
});
