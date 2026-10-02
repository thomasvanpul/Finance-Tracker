// Lock · Cash Flow Forecast follows DESIGN.md §10.
//
// The loading line, the empty state (title, sentences, button), the scenario
// and multipliers buttons, the multiplier group headings and field labels, the
// trend sentences, the reset button, the persona strip, the panel captions,
// the "vs today" / "crosses zero" / "lowest projected" sentences, the empty
// events state, the scenario legend and its footnote are language, so sans.
// Where a sentence carries a figure, the figure is a .pnum span inside it.
//
// The KPI and big-number legends and figures, the break-even date, the
// horizon durations (30d …), the multiplier inputs and their %, the table
// headers and cells, the chart axes, reference labels and tooltip are data or
// legends, so mono, and stay.
//
// There is no DOM test environment in this package, so this reads the source,
// the same way the other *.lock.test.ts files do.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.resolve(__dirname, "./cashflow.tsx"), "utf8");

function at(copy: string, within = src): number {
  const i = within.indexOf(copy);
  if (i < 0) throw new Error(`${copy} not found`);
  return i;
}

// The style block that draws a piece of copy: from the nearest `style={{`
// before it up to the copy itself.
function styleBefore(copy: string, within = src): string {
  const i = at(copy, within);
  return within.slice(within.lastIndexOf("style={{", i), i);
}

function bodyOf(fnName: string): string {
  const start = at(`function ${fnName}(`);
  const next = src.indexOf("\nfunction ", start + 1);
  const nextExport = src.indexOf("\nexport ", start + 1);
  const ends = [next, nextExport].filter((i) => i > 0);
  return src.slice(start, ends.length ? Math.min(...ends) : undefined);
}

const MONO = /--font-mono|\.\.\.mono\b|\.\.\.labelStyle\b|\.\.\.th\b|\.\.\.td\b|className="pnum"/;

const SANS = /--font-sans|\.\.\.sans\b/;

function expectSans(block: string) {
  expect(block).toMatch(SANS);
  expect(block).not.toMatch(MONO);
}

describe("Cash flow type: language is sans", () => {
  it.each([
    "Loading cash flow data…",
    "CASH FLOW FORECAST",
    "Add an account to see your cash flow forecast",
    "Cash flow projections use your account balances",
    "+ ADD ACCOUNT",
    "<Settings size={10}",
    "Optimistic\n              </div>",
    "Pessimistic\n              </div>",
    "Base: 3-month avg net/day",
    "Avg income:",
    "Avg expense:",
    "Reset to defaults",
    "Balance crosses zero",
    "Lowest projected:",
    "Variable trend based on 3-month avg",
  ])("draws %j in sans", (copy) => {
    expectSans(styleBefore(copy));
  });

  it("draws the scenario buttons in sans", () => {
    expectSans(styleBefore('? `OPT +${multipliers.optimisticIncomeBoost}'));
  });

  it("draws the empty events state in sans", () => {
    // The family sits on the container, after its padding.
    const i = at('padding: "24px 20px"');
    expectSans(src.slice(src.lastIndexOf("style={{", i), src.indexOf("}}", i)));
  });

  it("draws the multiplier field labels in sans", () => {
    expectSans(styleBefore("{labelText}", bodyOf("MultiplierInput")));
  });

  it("draws the scenario legend names and its label in sans", () => {
    expectSans(styleBefore("{s === \"optimistic\"", bodyOf("ScenarioLegendItem")));
    expectSans(styleBefore("SCENARIOS:"));
  });

  it("draws the persona strip in sans, its sentence not a .pnum block", () => {
    const i = at("const color = PERSONA_COLORS");
    const strip = src.slice(i, src.indexOf("})()}", i));
    expectSans(styleBefore("<span style={{ color, fontWeight", strip));
    expect(strip).not.toMatch(/className="pnum"[^>]*>\{msg\}/);
  });

  it("draws the panel captions without mono", () => {
    for (const copy of ["Day-by-day projected cumulative balance", "Upcoming bills and income within"]) {
      const i = at(copy);
      expect(src.slice(src.lastIndexOf("<Text", i), i)).not.toMatch(/\bmono\b/);
    }
  });

  it("keeps the figure inside the 'vs today' sentence as .pnum", () => {
    expectSans(styleBefore('<span className="pnum">{`${finalBalance >= startingBalance'));
  });
});

describe("Cash flow type: data stays mono", () => {
  it("keeps the KPI legend and figures mono", () => {
    const tile = bodyOf("KpiTile");
    expect(styleBefore("{label}", tile)).toContain("...labelStyle");
    expect(styleBefore("{value}", tile)).toContain("...mono");
  });

  it("keeps the shared legend, header and cell atoms mono", () => {
    for (const atom of ["const labelStyle", "const th", "const td"]) {
      const i = at(atom);
      expect(src.slice(i, src.indexOf("};", i))).toContain("...mono");
    }
  });

  it("keeps the horizon durations mono", () => {
    expect(styleBefore("{h}d")).toContain("...mono");
  });

  it("keeps the multiplier input and its % mono", () => {
    const fn = bodyOf("MultiplierInput");
    expect(styleBefore("width: 48", fn)).toContain("...mono");
    expect(styleBefore(">%</span>", fn)).toContain("...mono");
  });

  it("keeps the break-even date and the tooltip mono", () => {
    expect(styleBefore("{formatShortDate(breakEvenDate)}\n")).toContain("...mono");
    expect(bodyOf("CfTooltip")).toContain('fontFamily: "var(--font-mono)"');
  });

  it("keeps the chart axes mono", () => {
    const i = at("<XAxis");
    expect(src.slice(i, at("<Tooltip"))).not.toContain("--font-sans");
  });
});
