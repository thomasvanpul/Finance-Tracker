import { describe, it, expect } from "vitest";
import { filterGroups } from "./DirectoryScreen";

// While searching, DIRECTORY renders one heading per returned group with
// its items beneath. A group returned with no items draws a bare heading
// that leads nowhere — "data" used to match the DATA heading while its one
// item (Import) did not, so DATA showed with nothing under it.

describe("filterGroups · DIRECTORY search", () => {
  it("never returns a group with zero items", () => {
    for (const q of ["data", "goals", "people", "settings", "reports", "calculators", "zzz"]) {
      for (const g of filterGroups(q)) {
        expect(g.items.length, `"${q}" returned ${g.heading} empty`).toBeGreaterThan(0);
      }
    }
  });

  it("a heading match shows that group's destinations", () => {
    const data = filterGroups("data").find((g) => g.key === "data");
    expect(data?.items.map((i) => i.href)).toEqual(["/import"]);
  });

  it("a heading match keeps every item in the group, not only the ones whose text matches", () => {
    const calc = filterGroups("calculators").find((g) => g.key === "calculators");
    expect(calc?.items.length).toBe(7);
  });

  it("an item match still narrows to the matching items", () => {
    const groups = filterGroups("mortgage");
    expect(groups.map((g) => g.key)).toEqual(["calculators"]);
    expect(groups[0].items.map((i) => i.href)).toEqual(["/mortgage"]);
  });

  it("an empty query returns every group untouched", () => {
    expect(filterGroups("  ").length).toBe(6);
  });
});
