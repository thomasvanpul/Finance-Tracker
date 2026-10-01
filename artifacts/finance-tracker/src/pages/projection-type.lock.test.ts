// Lock · Net Worth Projection follows DESIGN.md §10.
//
// The empty state, the breakdown row names, the savings-pace caption, the
// persona strip, the show/hide scenarios button and the scenario-range caption
// are language, so sans. The KPI legends and figures, the milestone table, the
// control legends and rates, the slider scales, the horizon durations, the
// chart axes and every money figure are data, so mono, and stay.
//
// There is no DOM test environment in this package, so this reads the source,
// the same way the other *.lock.test.ts files do.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.resolve(__dirname, "./projection.tsx"), "utf8");

function bodyOf(fnName: string): string {
  const start = src.search(new RegExp(`function ${fnName}\\(`));
  if (start < 0) throw new Error(`${fnName} not found`);
  const next = src.indexOf("\nfunction ", start + 1);
  const nextExport = src.indexOf("\nexport ", start + 1);
  const ends = [next, nextExport].filter((i) => i > 0);
  return src.slice(start, ends.length ? Math.min(...ends) : undefined);
}

// The style block that draws a piece of copy: from the nearest `style={{`
// before it up to the copy itself.
function styleBefore(copy: string, within = src): string {
  const at = within.indexOf(copy);
  if (at < 0) throw new Error(`${copy} not found`);
  return within.slice(within.lastIndexOf("style={{", at), at);
}

describe("Projection type: language is sans", () => {
  it.each([
    "Projection needs a real net worth",
    "{savingsAdj > 0 ?",
    "{showScenarios ? \"Hide scenarios\" : \"Show scenarios\"}",
    "▲ baseline",
  ])("draws %s in sans", (copy) => {
    const block = styleBefore(copy);
    expect(block).toContain("--font-sans");
    expect(block).not.toContain("--font-mono");
    expect(block).not.toContain("...mono");
  });

  it("draws the breakdown row name in sans", () => {
    const block = styleBefore("{label}", bodyOf("BreakdownRow"));
    expect(block).toContain("--font-sans");
    expect(block).not.toContain("--font-mono");
  });

  // {msg} has no style of its own; it inherits from the strip container.
  it("draws the persona strip, container included, in sans", () => {
    const start = src.indexOf("const color = PERSONA_COLORS");
    const block = src.slice(start, src.indexOf("{msg}", start));
    expect(block).toContain("--font-sans");
    expect(block).not.toContain("--font-mono");
  });
});

describe("Projection type: data stays mono", () => {
  it("keeps the breakdown value mono", () => {
    const block = styleBefore("<span className=\"pnum\">{value}</span>", bodyOf("BreakdownRow"));
    expect(block).toContain("--font-mono");
  });

  it("keeps the range caption's three figures as .pnum", () => {
    const at = src.indexOf("▲ baseline");
    const caption = src.slice(at, src.indexOf("</div>", at));
    expect(caption.match(/className="pnum"/g)?.length).toBe(3);
  });

  it("keeps the KPI legend and figure mono", () => {
    expect(bodyOf("KpiCell").match(/--font-mono/g)?.length).toBe(2);
  });

  it("keeps the milestone header and the four milestone cells mono", () => {
    expect(bodyOf("MilestoneHeader")).toContain("...mono");
    expect(bodyOf("MilestoneRow").match(/--font-mono/g)?.length).toBe(4);
  });

  it.each(["BASE ANNUAL RETURN", "MONTHLY SAVINGS", "SCENARIO RANGE AT"])(
    "keeps the %s legend mono",
    (copy) => {
      expect(styleBefore(copy)).toContain("...mono");
    },
  );
});
