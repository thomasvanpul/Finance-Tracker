// Lock · Decisions follows DESIGN.md §10.
//
// The category badge, priority label, decision title and detail, the action
// link, the impact caption, the show-dismissed button, the persona strip and
// the empty state are language, so sans. The KPI legends and figures, the
// days-left count and the annual-impact money are data, so mono, and stay.
//
// There is no DOM test environment in this package, so this reads the source,
// the same way the other *.lock.test.ts files do.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.resolve(__dirname, "./decisions.tsx"), "utf8");

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

describe("Decisions type: language is sans", () => {
  const row = bodyOf("DecisionRow");

  it.each([
    "{CATEGORY_LABEL[d.category]}",
    "{d.priority}",
    "{d.title}",
    "{d.detail}",
    "{d.action}",
  ])("draws %s in sans", (copy) => {
    const block = styleBefore(copy, row);
    expect(block).toContain("--font-sans");
    expect(block).not.toContain("--font-mono");
  });

  it("does not put .pnum (which is mono) on the title or the detail", () => {
    expect(row).not.toMatch(/className="pnum"\s*style=\{\{[^}]*\}\}\s*>\s*\{d\.title\}/);
    expect(row).not.toMatch(/className="pnum"\s*style=\{\{[^}]*\}\}\s*>\s*\{d\.detail\}/);
  });

  it.each(['{showDismissed ? "HIDE" : "SHOW"}', "Sorted for {activePersona.label}"])(
    "draws %s in sans",
    (copy) => {
      expect(styleBefore(copy)).not.toContain("--font-mono");
    },
  );

  it("draws the empty state, container included, in sans", () => {
    const start = src.indexOf("active.length === 0 ?");
    const empty = src.slice(start, src.indexOf("Check back after", start));
    expect(empty).not.toContain("--font-mono");
    expect(empty).toContain("--font-sans");
  });
});

describe("Decisions type: data stays mono", () => {
  it("keeps the days-left count and the impact money as figures", () => {
    const row = bodyOf("DecisionRow");
    expect(row).toContain(`<span className="pnum">{d.daysUntilDeadline}d</span> left`);
    expect(row).toContain(`<span className="pnum">{formatBaseMoney(d.annualCost)}</span>/yr impact`);
  });

  it("keeps the KPI legend and figure mono", () => {
    expect(bodyOf("SummaryKpiCell").match(/--font-mono/g)?.length).toBe(2);
  });
});
