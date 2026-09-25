import { describe, it, expect } from "vitest";
import { sinceCloseLabel } from "./FixingMark";

// The portfolio day-change is close-to-close. On Monday 14 Sep 2026 it runs
// from Friday 11 Sep's close — 72 hours — so "24H" was untrue on every Monday
// and after every exchange holiday. The label names the session instead.
describe("sinceCloseLabel", () => {
  it("dates the delta by the session it runs from", () => {
    // sameDayLabel formats the month in the viewer's locale, so the host's
    // LANG decides "SEP" (en-US) or "SEPT" (en-GB, en-NZ). Pinning either
    // made the gate pass or fail by which shell launched it (25 Sep 2026).
    const month = new Date(2026, 8, 11)
      .toLocaleString(undefined, { month: "short" })
      .toUpperCase();
    expect(month).toMatch(/^SEPT?$/);
    expect(sinceCloseLabel("2026-09-11")).toBe(`SINCE 11 ${month}`);
  });

  it("never claims a fixed span when the baseline is undated", () => {
    expect(sinceCloseLabel(null)).toBe("SINCE PREV CLOSE");
    expect(sinceCloseLabel(undefined)).toBe("SINCE PREV CLOSE");
    expect(sinceCloseLabel(null)).not.toMatch(/24H/);
  });
});
