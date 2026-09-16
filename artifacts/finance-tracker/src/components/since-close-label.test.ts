import { describe, it, expect } from "vitest";
import { sinceCloseLabel } from "./FixingMark";

// The portfolio day-change is close-to-close. On Monday 14 Sep 2026 it runs
// from Friday 11 Sep's close — 72 hours — so "24H" was untrue on every Monday
// and after every exchange holiday. The label names the session instead.
describe("sinceCloseLabel", () => {
  it("dates the delta by the session it runs from", () => {
    expect(sinceCloseLabel("2026-09-11")).toBe("SINCE 11 SEP");
  });

  it("never claims a fixed span when the baseline is undated", () => {
    expect(sinceCloseLabel(null)).toBe("SINCE PREV CLOSE");
    expect(sinceCloseLabel(undefined)).toBe("SINCE PREV CLOSE");
    expect(sinceCloseLabel(null)).not.toMatch(/24H/);
  });
});
