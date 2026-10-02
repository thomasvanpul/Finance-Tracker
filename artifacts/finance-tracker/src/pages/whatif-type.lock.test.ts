// Lock · the What-If simulator follows DESIGN.md §10 (finding 928333794e02).
//
// The tab bar, slider and field labels, the scenario and quick-cut buttons,
// category names, chart legend names, the empty states, the persona strip,
// the inflation tile notes and every sentence are language, so sans. The
// figures, the slider readouts and ranges, the BigNumber legends, the panel
// kickers above figures, table column headers and row legends, tickers, the
// formula and its parameters, chart axes and tooltips, and the custom % input
// are data or legends, so mono, and stay.
//
// Where a sentence carries a figure, the figure is a .pnum span inside the
// sans sentence.
//
// There is no DOM test environment in this package, so this reads the source,
// the same way the other *.lock.test.ts files do.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.resolve(__dirname, "./whatif.tsx"), "utf8");

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

// The first style block after an anchor.
function styleAfter(anchor: string): string {
  const start = src.indexOf("style={{", at(anchor));
  return src.slice(start, src.indexOf("}}", start));
}

function expectSans(block: string) {
  expect(block).toContain("--font-sans");
  expect(block).not.toContain("--font-mono");
  expect(block).not.toMatch(/\.\.\.mono\b/);
}

function expectMono(block: string) {
  expect(block).toMatch(/--font-mono|\.\.\.mono\b|className="pnum"/);
  expect(block).not.toContain("--font-sans");
}

describe("What-If type: language is sans", () => {
  it.each([
    "{tab.label}\n          </button>",
    "{label}\n        </label>",
    "{label} ({change >= 0",
    "{c.label}\n        </label>",
    "Add a budget or import transactions to model expense cuts.",
    "{s.label}\n          </button>",
    "Reset all",
    "Monthly equivalent = what you'd need",
    "/mo min to cover interest",
    ">Minimum payment<",
    ">With extra payment<",
    "more months not shown",
    "{label}</span>",
    "{note}</div>",
    "No positions found",
    "Add positions in the Portfolio tab",
    "Custom change %:",
  ])("%s", (copy) => {
    expectSans(styleBefore(copy));
  });

  it("the persona strip is sans", () => {
    expectSans(styleAfter("const color = PERSONA_COLORS"));
  });

  it("the debt chart's legend names are sans", () => {
    const i = at("<Legend iconType");
    const block = src.slice(i, src.indexOf("/>", i));
    expect(block).toContain("--font-sans");
    expect(block).not.toContain("--font-mono");
  });

  it("figures inside sentences stay mono", () => {
    expect(styleBefore("/mo min to cover interest")).toContain('className="pnum"');
    expect(styleBefore("more months not shown")).toContain('className="pnum"');
    expect(src).toContain('Lost <span className="pnum">');
    expect(src).toContain('Real return: <span className="pnum">');
  });

  it("the inflation tile note is not a .pnum block", () => {
    expect(styleBefore("{note}</div>")).not.toContain('className="pnum"');
    expect(src).not.toMatch(/className="pnum"[^>]*>\{note\}/);
  });
});

describe("What-If type: data and legends stay mono", () => {
  it.each([
    ">Surplus Impact<",
    ">IMPACT SUMMARY<",
    ">MINIMUM PAYMENT<",
    "FV = P × (1 + r)^n",
    "{label}\n      </div>",
    "{row.label}</td>",
    "{pos.ticker}</td>",
    "Savings by Category",
  ])("%s", (copy) => {
    expectMono(styleBefore(copy));
  });

  it("the custom % input is mono", () => {
    expectMono(styleAfter('type="number"'));
  });

  it("the slider readout is mono", () => {
    expectMono(styleBefore("<span className=\"pnum\">{display}</span>"));
  });
});
