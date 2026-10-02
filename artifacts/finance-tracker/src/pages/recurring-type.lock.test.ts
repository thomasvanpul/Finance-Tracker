// Lock · /recurring follows DESIGN.md §10 (finding 928333794e02).
//
// Language is sans: every button (the BTN and BTN_GHOST atoms, the view-mode
// tabs, the ON/OFF toggle), the field labels and the six inputs, the search
// field and frequency select, the KPI sub-lines, every name a human wrote (the
// series' merchant, its frequency chip when it is a word ("monthly"; a
// duration such as "~11d" is data and stays mono), its category chip, the category legend, the
// calendar cell's merchant, a rule's match text, category and notes, and the
// description and categories in the match and preview rows), the sentences
// ("£X due this month", the trend line, the apply summary and its confirm
// line, "…and N more"), the empty and loading lines, the three panel captions
// and the persona strip. Where a sentence carries a figure, the figure is a
// .pnum span inside it.
//
// Data stays mono: the shared legend, header and cell atoms (labelStyle, th,
// td), the KPI figures, the trend figures, every amount, the confidence badge,
// the last-seen / next-estimated dates, the occurrence count, the calendar's
// day numbers and weekday headers, the donut's TOTAL legend, and the dates in
// the match and preview rows.
//
// There is no DOM test environment in this package, so this reads the source,
// the same way the other *.lock.test.ts files do.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.resolve(__dirname, "./recurring.tsx"), "utf8");

// Where a piece of copy sits; it must occur exactly once.
function at(copy: string): number {
  const first = src.indexOf(copy);
  if (first < 0) throw new Error(`${copy}: not found`);
  if (src.indexOf(copy, first + 1) >= 0) throw new Error(`${copy}: occurs more than once`);
  return first;
}

// The nearest inline style object above a piece of copy, up to the copy.
function styleBefore(copy: string): string {
  const i = at(copy);
  return src.slice(src.lastIndexOf("style={{", i), i);
}

// An input's style comes after its other attributes.
function styleAfter(copy: string): string {
  const i = at(copy);
  const start = src.indexOf("style={{", i);
  return src.slice(start, src.indexOf("}}", start));
}

// The opening tag a piece of copy sits in, for a style given by name.
function tagBefore(copy: string, tag: string): string {
  const i = at(copy);
  return src.slice(src.lastIndexOf(`<${tag}`, i), i);
}

function atom(name: string): string {
  const i = at(`const ${name}: React.CSSProperties = {`);
  return src.slice(i, src.indexOf("};", i));
}

const MONO = /--font-mono|\.\.\.mono\b|\.\.\.labelStyle\b|\.\.\.th\b|\.\.\.td\b|className="pnum"|\bmono\b/;
// fieldLabel, emptyLine and tdText are asserted sans by the atom tests below.
const SANS = /--font-sans|\.\.\.sans\b|\.\.\.tdText\b|\.\.\.emptyLine\b|\bfieldLabel\b|\btdText\b/;

function expectSans(block: string) {
  expect(block).toMatch(SANS);
  expect(block).not.toMatch(MONO);
}

describe("Recurring type: language is sans", () => {
  it.each(["BTN", "BTN_GHOST", "fieldLabel", "emptyLine"])("the %s atom is sans", (name) => {
    expectSans(atom(name));
  });

  it("the text-cell atom is the cell atom with sans over it", () => {
    expect(atom("tdText")).toMatch(/\.\.\.td,\s*\.\.\.sans/);
  });

  it.each([
    ["the KPI sub-line", "{k.sub}"],
    ["the category legend name", "<Drill href={categoryTransactionsHref(category)}"],
    ["the calendar cell merchant", "{p.merchantName.slice(0, 8)}"],
    ["the 'due this month' sentence", '<span className="pnum">{formatBaseMoney(monthTotal)}</span> due this month'],
    ["the trend sentence", '{up ? "↑ recurring costs rising"'],
    ["the series merchant", "<Drill href={merchantTransactionsHref(p.merchantName)} title={`Open the ${p.merchantName}"],
    ["the category chip", "<Drill href={categoryTransactionsHref(p.category)}"],
    ["the frequency select", '<option value="all">All frequencies</option>'],
    ["the filter count", '<span className="pnum">{visible.length}</span> of'],
    ["the ON/OFF toggle", '{rule.isActive ? "ON" : "OFF"}'],
    ["the test-matches heading", "Top matching transactions (showing up to 5)"],
    ["a test match's description", "{t.description}</Drill>"],
    ["a test match's category", "{t.category ? <Drill"],
    ["a test match's new category", "→ {rule.category}"],
    ["the test-matches overflow line", '…and <span className="pnum">{matchCount - 5}'],
    ["the apply summary", '<span className="pnum">{activeRules.length}</span> active rule'],
    ["the apply confirm line", "This will update"],
    ["the persona strip", "<span style={{ color, fontWeight: 700"],
    ["the more-categories line", '+<span className="pnum">{segments.length - 6}'],
  ])("%s is sans", (_name, copy) => {
    expectSans(styleBefore(copy));
  });

  it("the frequency chip is sans for a word and mono for a duration", () => {
    expect(styleBefore("{p.frequency}\n          </span>")).toContain("...(/\\d/.test(p.frequency) ? mono : sans)");
  });

  it.each([
    "— NO CATEGORY DATA —",
    "— NO PATTERNS MATCH CURRENT FILTERS —",
    "— NO RECURRING PATTERNS DETECTED —",
    "— NO MANUAL RULES —",
    "— ALL TRANSACTIONS CATEGORIZED —",
    "— LOADING TRANSACTION DATA —",
  ])("the empty or loading line %j is sans", (copy) => {
    expectSans(tagBefore(copy, "div"));
  });

  it.each([
    "Match text (substring)",
    "Assign category",
    "Notes (optional)",
    "Match text</div>",
    "Category</div>",
    "Notes</div>",
  ])("the field label %j is sans", (copy) => {
    expectSans(tagBefore(copy, "div"));
  });

  it.each([
    'placeholder="Search merchant…"',
    'placeholder="e.g. Netflix"',
    'placeholder="e.g. Subscriptions"',
    'placeholder="e.g. Monthly subscription"',
    "value={editForm.matchText}",
    "value={editForm.category}",
    "value={editForm.notes}",
  ])("the input with %s is sans", (copy) => {
    expectSans(styleAfter(copy));
  });

  it.each([
    ["a rule's match text", "{rule.matchText}\n        </td>"],
    ["a rule's category", "{rule.category}\n          </span>"],
    ["a rule's notes", '{rule.notes || "—"}'],
    ["a preview row's description", "{tx.description}</Drill>"],
    ["a preview row's category", "{tx.category ? <Drill"],
    ["a preview row's rule", "{rule.matchText}</td>"],
    ["a preview row's new category", "{newCategory}\n        </span>"],
    ["the preview overflow line", '…and <span className="pnum">{preview.length - 50}'],
  ])("%s sits in a sans cell", (_name, copy) => {
    expectSans(tagBefore(copy, "td"));
  });

  it.each([
    "Matched by description + interval + amount",
    "Define rules to auto-categorize transactions",
    "Preview and apply active rules",
  ])("the panel caption %j is not mono", (copy) => {
    const i = at(copy);
    expect(src.slice(src.lastIndexOf("<Text", i), i)).not.toMatch(/\bmono\b/);
  });
});

describe("Recurring type: data stays mono", () => {
  it.each(["labelStyle", "th", "td"])("the %s atom is mono", (name) => {
    expect(atom(name)).toContain("...mono");
  });

  it.each([
    ["the KPI figure", '<span className="pnum">{k.value}</span>'],
    ["the donut TOTAL legend", ">TOTAL</div>"],
    ["the calendar day number", "        {day}\n      </div>"],
    ["the last-seen date", "{p.lastOccurrence}"],
    ["the next-estimated date", "{p.nextEstimated}\n"],
    ["a test match's date", "{t.date}"],
    ["a test match's amount", '<span className="pnum">{formatBaseMoney(t.baseEquivalent)}</span>'],
    ["the confidence badge", '<span className="pnum">{score}</span>% CONF'],
    ["the weekday header", "{d}</div>"],
  ])("%s is mono", (_name, copy) => {
    expect(styleBefore(copy)).toMatch(/\.\.\.mono\b|\.\.\.labelStyle\b/);
  });

  it("a preview row's date stays in a mono cell", () => {
    expect(tagBefore("{tx.date}</td>", "td")).toMatch(/\.\.\.td\b/);
  });
});
