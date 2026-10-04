// Lock · the net-worth history page follows DESIGN.md §10 (finding 928333794e02).
//
// The leverage and CAGR sentences, the target empty state, the custom
// milestone names and the row notes are language, so sans. The figures, the
// dates, the stat legends above figures, the Current / Remaining / Target
// legends beside their figures, table column headers, chart ticks and
// tooltips, the number inputs and the decorative box drawing are data,
// legends or drawing, so mono, and stay.
//
// Where a sentence carries a figure, the figure sits inside the sans
// sentence in its own span.
//
// There is no DOM test environment in this package, so this reads the source,
// the same way the other *.lock.test.ts files do.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.resolve(__dirname, "./net-worth-history.tsx"), "utf8");

// Where a piece of copy sits; it must occur exactly once.
function at(copy: string): number {
  const first = src.indexOf(copy);
  if (first < 0) throw new Error(`${copy}: not found`);
  if (src.indexOf(copy, first + 1) >= 0) throw new Error(`${copy}: occurs more than once`);
  return first;
}

// The style block that draws a piece of copy: from the nearest `style={{`
// before it up to the copy itself.
function styleBefore(copy: string): string {
  const i = at(copy);
  return src.slice(src.lastIndexOf("style={{", i), i);
}

describe("net-worth history type: language is sans", () => {
  it.each([
    "Leverage ratio:",
    "At your historical CAGR of",
    "Enter a target net worth to see projections",
    "{m.label}</div>",
    "{rowNote(e)}\n                        </span>",
  ])("%s", (copy) => {
    const block = styleBefore(copy);
    expect(block).toContain("--font-sans");
    expect(block).not.toContain("--font-mono");
  });
});

// The first style block after an anchor.
function styleAfter(anchor: string): string {
  const start = src.indexOf("style={{", at(anchor));
  return src.slice(start, src.indexOf("}}", start));
}

describe("net-worth history type: data and legends stay mono", () => {
  it.each(["Current: <span", "Remaining: <span", "Target: <span"])("%s", (copy) => {
    const block = styleBefore(copy);
    expect(block).toContain("--font-mono");
    expect(block).not.toContain("--font-sans");
  });

  it("the target input is a number and stays mono", () => {
    const block = styleAfter('placeholder="e.g. 500000"');
    expect(block).toContain("--font-mono");
  });
});
