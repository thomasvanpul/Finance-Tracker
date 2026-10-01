// Lock · WORTH spacing is the phone rhythm (DESIGN.md §3, phone/rhythm.ts).
//
// ── The defect this stops ─────────────────────────────────────────────────
// rhythm.ts decided the phone's vertical spacing once, and HOME adopted it.
// WORTH never did: its groups were spaced 20/16/12 by hand, the
// change-attribution block was inset 18 where every other edge is 16, and
// the insight band sat directly on the last BY CURRENCY row with nothing
// between them, while CASH and HOLDINGS sat directly on whatever came
// before. The finding (16 Sep 2026 phone-design-rules report) was that
// WORTH had no rhythm, only a set of numbers.
//
// There is no DOM test environment in this package, so this reads the
// source, the same way the other *.lock.test.ts files do. It asserts the
// shape, not pixels: every group on WORTH takes its gap from PHONE_GROUP_GAP
// and its inset from PHONE_GUTTER.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
const worth = read("./WorthScreen.tsx");
const attribution = read("../change-attribution.tsx");

// The phone block is everything from its section marker to the end of the file.
const attributionPhone = attribution.slice(attribution.indexOf("// ── Phone"));

function bodyOf(src: string, fnName: string): string {
  const start = src.indexOf(`function ${fnName}(`);
  if (start < 0) throw new Error(`${fnName} not found`);
  const next = src.indexOf("\nfunction ", start + 1);
  return src.slice(start, next < 0 ? undefined : next);
}

describe("WORTH rhythm", () => {
  it("has no hand-written group padding on the hero or the composition", () => {
    expect(worth).not.toMatch(/padding:\s*"20px 16px 12px"/);
    expect(worth).not.toMatch(/padding:\s*"0 16px 16px"/);
  });

  it("insets the change-attribution phone block on the 16 gutter, not 18", () => {
    expect(attributionPhone).not.toMatch(/18px/);
    expect(attributionPhone).toMatch(/PHONE_GUTTER/);
  });

  it("puts a group gap above the insight band, as HOME does", () => {
    expect(worth).toMatch(/paddingTop:\s*PHONE_GROUP_GAP[^]{0,80}<InsightSlot/);
  });

  it.each(["CurrencySplit", "AccountSection", "HoldingsSection"])(
    "%s opens with a group gap above its rule",
    (fn) => {
      expect(bodyOf(worth, fn)).toMatch(/marginTop:\s*PHONE_GROUP_GAP/);
    },
  );
});
