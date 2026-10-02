// Lock · the two investment modals follow DESIGN.md §10 (finding 928333794e02).
//
// Advanced chart (chart-analysis-modal.tsx): the overlay and panel toggle
// buttons, the OVERLAYS / PANELS control labels, the loading and empty lines,
// the RSI and MACD signal sentences, the RSI help line and the data
// attribution are language, so sans. The ticker, price, change, period
// return, period codes, the panel legends (PRICE, VOLUME, RSI (14), MACD),
// the series legends, the OHLC and chart tooltips and the ADVANCED CHART
// header are data or headers, so mono, and stay.
//
// Stat drill (stat-drill-modal.tsx): the empty lines, the assessment's
// context sentence, the "what this measures" prose and each key insight are
// language, so sans. The metric name, its value, the assessment badge, the
// section headers, the formula, the axis ticks, tooltips, chart legends and
// the five quality names are data, enum state or headers, so mono, and stay.
//
// There is no DOM test environment in this package, so this reads the source,
// the same way the other *.lock.test.ts files do.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(path.resolve(__dirname, f), "utf8");
const chart = read("./chart-analysis-modal.tsx");
const drill = read("./stat-drill-modal.tsx");

// The style block that draws a piece of copy: from the nearest `style={{`
// before its one occurrence up to the copy itself.
function styleBefore(src: string, copy: string): string {
  const at = src.indexOf(copy);
  if (at < 0) throw new Error(`${copy} not found`);
  if (src.indexOf(copy, at + 1) >= 0) throw new Error(`${copy} is not unique`);
  return src.slice(src.lastIndexOf("style={{", at), at);
}

function expectSans(block: string) {
  expect(block).toContain("--font-sans");
  expect(block).not.toContain("--font-mono");
}

describe("Advanced chart type: language is sans", () => {
  it.each([
    ">OVERLAYS</span>",
    ">PANELS</span>",
    "Loading chart data…",
    "No data available",
    "{rsiSignal.text}",
    "RSI: &lt;30 oversold",
    "{macdSignal.text}",
    "Data via Yahoo Finance",
  ])("draws %s in sans", (copy) => expectSans(styleBefore(chart, copy)));

  it("draws the overlay and panel toggle buttons in sans", () => {
    const start = chart.indexOf("function ToggleBtn");
    const body = chart.slice(start, chart.indexOf("\n}\n", start));
    expectSans(body);
  });
});

describe("Advanced chart type: data stays mono", () => {
  it.each([
    "{ticker}</span>",
    "${price.toFixed(2)}</span>",
    "ADVANCED CHART</div>",
    ">PRICE</div>",
    ">VOLUME</div>",
    ">RSI (14)</div>",
    ">MACD (12, 26, 9)</div>",
    "── SMA 20",
    "── SMA 50",
  ])("keeps %s mono", (copy) => expect(styleBefore(chart, copy)).toContain("--font-mono"));
});

describe("Stat drill type: language is sans", () => {
  it.each([
    "No earnings history available.",
    "{assessment.context}",
    "{info}",
    "{ins}",
    "No benchmark data available for this metric.",
  ])("draws %s in sans", (copy) => expectSans(styleBefore(drill, copy)));
});

describe("Stat drill type: data stays mono", () => {
  it.each([
    "Quarterly EPS — Actual vs Estimate",
    "Analyst Recommendation Trend",
    "{label}</div>",
    "{value}</div>",
    "{assessment.badge}",
    ">Formula</div>",
    "{bench.formula}",
    ">What This Measures</div>",
    ">Key Insights</div>",
    ">Quality Scale</div>",
  ])("keeps %s mono", (copy) => expect(styleBefore(drill, copy)).toContain("--font-mono"));
});
