import { describe, expect, it } from "vitest";
import { lowestSoFar, type DailyBalance } from "./lowest-so-far";

const day = (d: number, balance: number, future = false): DailyBalance => ({ day: d, balance, future });

describe("lowestSoFar", () => {
  it("returns the lowest day that has already happened", () => {
    expect(lowestSoFar([day(1, 900), day(5, 826.4), day(9, 1000)])).toEqual(day(5, 826.4));
  });

  it("ignores days that have not happened, however low they are", () => {
    // The strip's LOW is history. A projected dip belongs to the trough
    // insight, which carries its own date and its own wording.
    expect(lowestSoFar([day(1, 900), day(5, 826.4), day(7, -152.05, true)])).toEqual(day(5, 826.4));
  });

  it("is null when no day has happened yet", () => {
    expect(lowestSoFar([])).toBeNull();
    expect(lowestSoFar([day(1, 100, true)])).toBeNull();
  });
});
