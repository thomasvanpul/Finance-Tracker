// Lock · Business follows DESIGN.md §10.
//
// Buttons, field labels, text inputs, the status select, invoice status
// badges, client, description and expense names, category chips and toggles,
// KPI and VAT captions, the chart series key, the form error, the empty-state
// title and every sentence are language, so sans. KPI and VAT legends and
// figures, money, percentages, dates, the VAT quarter picker, the currency
// select, number and date inputs, the table column headers, chart axes and
// tooltip, and the sub-panel titles are data or headers, so mono, and stay.
//
// There is no DOM test environment in this package, so this reads the source,
// the same way the other *.lock.test.ts files do.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.resolve(__dirname, "./business.tsx"), "utf8");

function bodyOf(fnName: string): string {
  const start = src.search(new RegExp(`function ${fnName}\\(`));
  if (start < 0) throw new Error(`${fnName} not found`);
  const next = src.indexOf("\nfunction ", start + 1);
  const nextExport = src.indexOf("\nexport ", start + 1);
  const ends = [next, nextExport].filter((i) => i > 0);
  return src.slice(start, ends.length ? Math.min(...ends) : undefined);
}

function constOf(name: string): string {
  const start = src.indexOf(`const ${name}: React.CSSProperties = {`);
  if (start < 0) throw new Error(`${name} not found`);
  return src.slice(start, src.indexOf("};", start));
}

// The style block that draws a piece of literal copy: from the nearest
// `style={{` or `<Text` before it up to the copy itself.
function styleBefore(copy: string): string {
  const at = src.indexOf(copy);
  if (at < 0) throw new Error(`${copy} not found`);
  return src.slice(Math.max(src.lastIndexOf("style={{", at), src.lastIndexOf("<Text", at)), at);
}

describe("Business type: language is sans", () => {
  it.each(["CategoryChip", "CategoryToggleButton"])("%s carries no mono", (fn) => {
    expect(bodyOf(fn)).not.toContain("--font-mono");
  });

  it.each(["fieldLabel", "inputStyle", "selectStyle", "vatSub"])("%s is sans", (name) => {
    expect(constOf(name)).toContain("--font-sans");
  });

  it("keeps number and date inputs and the currency select mono", () => {
    expect(constOf("dataInputStyle")).toContain("--font-mono");
    expect(src.match(/style=\{dataInputStyle\}/g)?.length).toBe(3);
    expect(src).toMatch(/style=\{\{ \.\.\.selectStyle, fontFamily: "var\(--font-mono\)" \}\}\s*value=\{invoiceForm\.currency\}/);
  });

  it("draws the KPI caption in sans and keeps the legend and figure mono", () => {
    const kpi = bodyOf("KpiCell");
    expect(kpi).toMatch(/var\(--font-sans\)[^}]*}}\s*>\s*\{sub\}/);
    expect(kpi.match(/--font-mono/g)?.length).toBe(2);
  });

  it("keeps the counts and margin inside KPI captions as figures", () => {
    expect(src).toContain(`sub={<><span className="pnum">{ytdIncomeTxs.length}</span> income tx</>}`);
    expect(src).toContain(`sub={<><span className="pnum">{ytdExpenseTxs.length}</span> expense tx</>}`);
    expect(src).toMatch(/<span className="pnum">\{ytdMargin\.toFixed\(1\)\}%<\/span> margin/);
    expect(src).toMatch(/<span className="pnum">\{invoiceStats\.draftCount\}<\/span> draft/);
  });

  it("draws the invoice client, description and status in sans and keeps amount and dates mono", () => {
    const row = bodyOf("InvoiceRow");
    expect(row).toMatch(/fontFamily: "var\(--font-sans\)"[^}]*}}>\s*\{inv\.client\}/);
    expect(row).toMatch(/fontFamily: "var\(--font-sans\)"[^}]*}}>\s*\{inv\.description/);
    expect(row).not.toContain("--font-mono");
    expect(row).toMatch(/style=\{\{ \.\.\.TD, color: "var\(--ft-dim\)" \}\}>\s*\{formatDateShort\(inv\.issuedDate\)\}/);
  });

  it("draws the expense name and share caption in sans with the share as a figure", () => {
    const row = bodyOf("ExpenseRow");
    expect(row).toMatch(/fontFamily: "var\(--font-sans\)" \}\}>\{name\}/);
    expect(row).not.toContain("--font-mono");
    expect(row).toMatch(/<span className="pnum">\{\(\(value \/ total\) \* 100\)\.toFixed\(1\)\}%<\/span> of all expenses/);
  });

  it("draws the empty-state title in sans", () => {
    expect(bodyOf("EmptyState")).not.toContain("--font-mono");
  });

  it("draws the VAT figures' sub-caption rate as a figure", () => {
    expect(src).toContain(`<div style={vatSub}>@ <span className="pnum">20%</span> standard rate</div>`);
  });

  it.each([
    "NEW INVOICE",
    "{invoiceFormError}",
    "ADD INVOICE",
    "CANCEL",
    "Select which transaction categories count as business activity.",
    "No categories selected.",
    "ADD\n",
    ">Revenue<",
    ">Expenses<",
  ])("draws %s in sans", (copy) => {
    expect(styleBefore(copy)).not.toMatch(/--font-mono|<Text[^>]* mono/);
  });
});

// The disclaimer and the data-source note open with an icon or a label that
// carries its own style, so the nearest style block is not theirs. Read the
// whole block from its comment marker to the copy.
it.each([
  ["{/* VAT disclaimer */}", "Approximate figures only."],
  ["{/* ─── Data source note ─── */}", "All figures derived from imported transactions"],
])("Business type: the block after %s draws its sentence in sans", (marker, copy) => {
  const from = src.indexOf(marker);
  const to = src.indexOf(copy);
  expect(from).toBeGreaterThan(-1);
  expect(to).toBeGreaterThan(from);
  expect(src.slice(from, to)).not.toContain("--font-mono");
});

describe("Business type: data and headers stay mono", () => {
  it.each(["vatLabel", "vatValue"])("%s is mono", (name) => {
    expect(constOf(name)).toContain("--font-mono");
  });

  it("keeps the VAT quarter picker, the tooltip and the table headers mono", () => {
    expect(bodyOf("VatQuarterOption")).toContain("--font-mono");
    expect(bodyOf("ChartTooltip")).toContain("--font-mono");
    expect(styleBefore("{vatQuarter} · {VAT_QUARTERS[vatQuarter].label}")).toContain("--font-mono");
  });

  it.each(["Operating Expense Breakdown", "New Invoice\n", "Categories in your transactions", "Monthly Revenue vs Expenses"])(
    "keeps the sub-panel title %s mono",
    (copy) => {
      expect(styleBefore(copy)).toContain("--font-mono");
    },
  );
});
