// Lock · Year in Review follows DESIGN.md §10 (finding 928333794e02).
//
// The loading line, the page subtitle, the Play Wrapped / CSV / Print buttons,
// the persona strip, the empty state, the heatmap scale words, the quarter
// "No data" line, category names, the habit sentences, the net-worth verdict
// and its prompt, the savings-rate caption, and every sentence in the Wrapped
// overlay are language, so sans. The KPI, quarter, milestone and share-card
// legends and figures, heatmap months, ranks, percentages, the year selector,
// the Wrapped chapter kickers, legends, year, dates, best month and chapter
// counter are data or legends, so mono, and stay.
//
// The Wrapped overlay used to set mono on its root, so every sentence in it
// inherited mono. The root is sans now and each figure says mono itself, by
// .pnum or by fontFamily.
//
// There is no DOM test environment in this package, so this reads the source,
// the same way the other *.lock.test.ts files do.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.resolve(__dirname, "./year-review.tsx"), "utf8");

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
  expect(block).not.toMatch(/\.\.\.(mono|label)\b/);
}

function expectMono(block: string) {
  expect(block).toMatch(/--font-mono|\.\.\.(mono|label)\b|className="pnum"/);
  expect(block).not.toContain("--font-sans");
}

describe("Year in Review type: language is sans", () => {
  it.each([
    "Loading year data…",
    "your financial year — wrapped",
    "↓ CSV",
    "⎙ Print",
    "No transactions recorded for {year}",
    "+ ADD TRANSACTIONS",
    ">Low spend<",
    ">High spend<",
    ">No data<",
    ">\n        {row.cat}",
    ">No expense data for this year<",
    ">{f.text}<",
    "Based on income vs expenses tracked",
    '{delta >= 0 ? "Your finances grew this year."',
    '{delta >= 0 ? "Keep momentum going →"',
    'Savings rate: <span className="pnum" style',
    "→ See Full Report",
  ])("draws %s in sans", (copy) => expectSans(styleBefore(copy)));

  it("draws the Play Wrapped button in sans", () =>
    expectSans(styleAfter("setChapFade(true); setWrappedActive(true); }}")));

  it("draws the persona strip in sans, its message without .pnum", () => {
    expectSans(styleAfter("const color = PERSONA_COLORS"));
    expect(src).toContain("<span>{msg}</span>");
  });

  it("does not put .pnum on the habit sentences", () =>
    expect(src).not.toMatch(/className="pnum"[^>]*>\{f\.text\}/));

  it("does not draw the empty-state prompt with the mono Text prop", () => {
    const i = at("Import or add transactions to unlock");
    expect(src.slice(src.lastIndexOf("<Text", i), i)).not.toMatch(/\bmono\b/);
  });

  it("sets the Wrapped overlay root in sans, so its sentences inherit sans", () => {
    const i = at("position: \"fixed\", inset: 0, zIndex: 1000");
    const block = src.slice(src.lastIndexOf("style={{", i), src.indexOf("}}", i));
    expectSans(block);
  });

  it("draws the Wrapped top-category name in sans", () =>
    expect(src).toMatch(/item\.isName \? "var\(--font-sans\)" : "var\(--font-mono\)"/));
});

describe("Year in Review type: data and legends stay mono", () => {
  it.each([
    ">{tile.label}<",
    "{tile.value}",
    ">{m.name}<",
    ">INCOME<",
    ">NET<",
    "{row.pct.toFixed(1)}%",
    "Net Worth Delta This Year",
    "{f.marker}",
    "NUMERIS · MY YEAR IN NUMBERS",
    "{txCount} transactions tracked",
    "{chapter + 1} / {CHAPTER_COUNT}",
    "LARGEST SINGLE INCOME",
    "TOP SPENDING CATEGORY",
    "BIGGEST EXPENSE",
    "BEST MONTH",
    "YOUR {year} IN NUMBERS",
    "{fmtYM(wrappedData.bestMonthEntry[0])}",
    '{["· INTRO ·"',
  ])("keeps %s mono", (copy) => expectMono(styleBefore(copy)));

  it("keeps the Wrapped intro year mono", () =>
    expectMono(styleBefore("{year}</div>\n                <div style={{ fontSize: 20")));

  it("keeps the Wrapped savings-rate figure mono inside its sans sentence", () =>
    expect(src).toMatch(/Savings rate: <span className="pnum">\{wrappedData\.savingsRate/));

  it("keeps the biggest-expense date mono", () => {
    const i = at("{wrappedData.biggestExpense.date}");
    expect(src.slice(src.lastIndexOf("<Text", i), i)).toMatch(/\bmono\b/);
  });
});
