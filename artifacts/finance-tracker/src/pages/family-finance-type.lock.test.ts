// Lock · Family Finance follows DESIGN.md §10.
//
// Buttons, field labels, text inputs, selects, role and timeline-type badges,
// member, category, account, goal and event names, the COMPLETE status, KPI
// captions, chart name ticks and the empty-state copy are language, so sans.
// KPI legends and figures, money, percentages, dates, day counts, number and
// date inputs, the budget column headers and the panel counts are data, so
// mono, and stay.
//
// There is no DOM test environment in this package, so this reads the source,
// the same way the other *.lock.test.ts files do.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.resolve(__dirname, "./family-finance.tsx"), "utf8");

function bodyOf(fnName: string): string {
  const start = src.search(new RegExp(`function ${fnName}\\(`));
  if (start < 0) throw new Error(`${fnName} not found`);
  const next = src.indexOf("\nfunction ", start + 1);
  const nextExport = src.indexOf("\nexport ", start + 1);
  const ends = [next, nextExport].filter((i) => i > 0);
  return src.slice(start, ends.length ? Math.min(...ends) : undefined);
}

// The style block that draws a piece of literal copy: from the nearest
// `style={{` before it up to the copy itself.
function styleBefore(copy: string): string {
  const at = src.indexOf(copy);
  if (at < 0) throw new Error(`${copy} not found`);
  return src.slice(src.lastIndexOf("style={{", at), at);
}

describe("Family Finance type: language is sans", () => {
  it.each([
    "Btn",
    "FieldRow",
    "FtSelect",
    "RoleBadge",
    "IncomeLegendItem",
    "AccountToggleButton",
  ])("%s carries no mono", (fn) => {
    expect(bodyOf(fn)).not.toContain("--font-mono");
  });

  it("draws a text input in sans and keeps number and date inputs mono", () => {
    const input = bodyOf("FtInput");
    expect(input).toMatch(/type === "number" \|\| props\.type === "date"/);
    expect(input).toContain("--font-sans");
  });

  it("draws the KPI caption in sans and keeps the legend and figure mono", () => {
    const kpi = bodyOf("KpiCell");
    expect(kpi).toMatch(/var\(--font-sans\)[^}]*}}\s*>\s*\{sub\}/);
    expect(kpi.match(/--font-mono/g)?.length).toBe(2);
  });

  it("draws the spending legend's category name in sans and keeps its amount mono", () => {
    const row = bodyOf("SpendingLegendRow");
    expect(row).not.toMatch(/var\(--font-mono\)[^}]*}}\s*>\s*\{name\}/);
    expect(row).toMatch(/var\(--font-mono\)[^}]*}}\s*>\s*\{formatBaseMoney\(value\)\}/);
  });

  it("draws the timeline type and event name in sans and keeps date and amount mono", () => {
    const row = bodyOf("TimelineRow");
    expect(row).not.toMatch(/var\(--font-mono\)[^}]*}}\s*>\s*\{entry\.type\}/);
    expect(row).not.toMatch(/var\(--font-mono\)[^}]*}}\s*>\s*\{entry\.eventName\}/);
    expect(row.match(/--font-mono/g)?.length).toBe(2);
  });

  it("draws the budget category name in sans", () => {
    expect(bodyOf("BudgetRow")).not.toMatch(/var\(--font-mono\)[^}]*}}>\s*\{drillHref \? <Drill[^\n]*b\.category/);
  });

  it("draws the goal name, assignee and COMPLETE in sans and keeps the day count mono", () => {
    const row = bodyOf("GoalRow");
    expect(row).not.toMatch(/<Text as="span" mono size=\{12\} weight=\{600\}[^>]*>\s*\{g\.name\}/);
    expect(row).not.toMatch(/var\(--font-mono\)[^}]*}}>\s*\{memberName\(g\.assignedTo\)\}/);
    expect(row).not.toMatch(/<Text as="span" mono[^>]*>\s*COMPLETE/);
    expect(row).toMatch(/<Text as="span" mono size=\{9\}[^>]*>\s*\{daysLeft < 0/);
  });

  it("draws the member's name in sans", () => {
    expect(bodyOf("MemberCard")).not.toMatch(/var\(--font-mono\)", fontSize: 13, fontWeight: 700/);
  });

  it.each([
    "No accounts available",
    "No expense data this month",
    "Assign categories in the Household Budget section below",
  ])("draws %s in sans", (copy) => {
    const at = src.indexOf(copy);
    expect(at).toBeGreaterThan(-1);
    const before = src.slice(Math.max(src.lastIndexOf("style={{", at), src.lastIndexOf("<Text", at)), at);
    expect(before).not.toMatch(/--font-mono|<Text[^>]* mono/);
  });

  it("draws the members caption in sans with its counts as figures", () => {
    expect(styleBefore("member{members.length !== 1")).not.toContain("--font-mono");
  });

  it("draws the member names on the income chart axis in sans", () => {
    expect(src).not.toMatch(/dataKey="name"\s+width=\{60\}\s+tick=\{\{ fontFamily: "var\(--font-mono\)"/);
  });
});

describe("Family Finance type: data stays mono", () => {
  it("keeps the budget column headers mono", () => {
    expect(bodyOf("BudgetHeaderCell")).toContain("--font-mono");
  });

  it("keeps the goal funding figures mono", () => {
    expect(bodyOf("GoalRow")).toMatch(/var\(--font-mono\)[^}]*}}>\s*\{formatBaseMoney\(g\.currentAmount\)\}/);
  });
});
