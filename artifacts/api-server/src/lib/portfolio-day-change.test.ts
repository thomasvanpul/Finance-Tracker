// Lock for the whole-portfolio day change: an unknown or unequal leg makes
// the total unknown. The case that forced it is the third one — equities
// close-to-close from Friday next to a crypto leg whose baseline is undated.
import { describe, it, expect } from "vitest";
import { foldDayChange } from "./portfolio-day-change";

const leg = (dayBase: number | null, dayPrevBase: number | null, dayFromSession: string | null) =>
  ({ dayBase, dayPrevBase, dayFromSession });

describe("foldDayChange", () => {
  it("sums legs that share one dated session, and dates the total by it", () => {
    expect(foldDayChange([leg(10, 100, "2026-09-11"), leg(-4, 50, "2026-09-11")])).toEqual({
      dayChangeBase: 6, dayChangePrevValueBase: 150, dayChangeFromSession: "2026-09-11",
    });
  });

  it("is unknown when any leg is missing its delta or baseline", () => {
    const unknown = { dayChangeBase: null, dayChangePrevValueBase: null, dayChangeFromSession: null };
    expect(foldDayChange([leg(10, 100, "2026-09-11"), leg(null, 50, "2026-09-11")])).toEqual(unknown);
    expect(foldDayChange([leg(10, null, "2026-09-11")])).toEqual(unknown);
  });

  it("is unknown when a leg's baseline is undated, even if its numbers are present", () => {
    expect(foldDayChange([leg(10, 100, "2026-09-11"), leg(30, 3000, null)]).dayChangeBase).toBeNull();
    expect(foldDayChange([leg(30, 3000, null), leg(10, 100, "2026-09-11")]).dayChangeBase).toBeNull();
  });

  it("is unknown when legs are measured from different sessions", () => {
    const r = foldDayChange([leg(10, 100, "2026-09-11"), leg(2, 20, "2026-09-14")]);
    expect(r).toEqual({ dayChangeBase: null, dayChangePrevValueBase: null, dayChangeFromSession: null });
  });

  it("is a real zero with no date when nothing is held", () => {
    expect(foldDayChange([])).toEqual({ dayChangeBase: 0, dayChangePrevValueBase: 0, dayChangeFromSession: null });
  });
});
