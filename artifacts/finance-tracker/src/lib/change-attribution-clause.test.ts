// The grammar of the WHAT CHANGED clause.
//
// The dev database currently yields a single-cause report, so the multi-cause
// wording cannot be seen in a screenshot without faking the endpoint — and
// attribution-shot.ts refuses to fake this endpoint on purpose, because
// rewriting its response would be screenshotting a fiction. This is where the
// two- and three-cause readings are actually checked.

import { describe, it, expect } from "vitest";
import { causeSegments } from "./change-attribution-view";
import type { AttributionRow } from "./change-attribution-view";

function row(label: string): AttributionRow {
  return { kind: "spend", label, amountBase: -1, detail: "", drillHref: "/", breakdown: [] };
}

function read(labels: string[]): string {
  return causeSegments(labels.map(row)).map(s => `${s.lead}${s.row.label}`).join("");
}

describe("causeSegments", () => {
  it("leaves a single cause alone", () => {
    expect(read(["the rate moved"])).toBe("the rate moved");
  });

  it("joins two causes with 'and'", () => {
    expect(read(["the rate moved", "nothing explains it"]))
      .toBe("the rate moved and nothing explains it");
  });

  it("joins three causes with commas and a final 'and', no Oxford comma", () => {
    expect(read(["you spent", "the rate moved", "nothing explains it"]))
      .toBe("you spent, the rate moved and nothing explains it");
  });

  it("holds at four", () => {
    expect(read(["a", "b", "c", "d"])).toBe("a, b, c and d");
  });

  it("has nothing to say about no causes", () => {
    expect(causeSegments([])).toEqual([]);
  });
});
