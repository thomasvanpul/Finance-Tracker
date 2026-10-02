// Lock · /trading follows DESIGN.md §10 (finding 928333794e02).
//
// Language is sans: the btnPrimary and btnGhost atoms (New Trade, Log Trade,
// Cancel, Log First Trade, a card's Edit and Delete), the row Edit button, the
// form's LONG/SHORT and OPEN/CLOSED toggles, the ALL/OPEN/CLOSED filter, Clear
// Filters and the setup filter, the fourteen field labels (fieldLabel), the
// setup select, tags input and notes textarea (inputText), the direction and
// status badges, the KPI sub-lines (counts are .pnum spans inside them), the
// streak's "winning run", every setup name (callout, open-position card, log
// row, setup-analysis row, the win-rate chart's axis and its tooltip), a
// trade's notes and tags, the keyboard hint, the empty and no-match lines, and
// the empty-state sentences.
//
// Data stays mono: the th and td atoms, inputStyle (ticker, dates, prices,
// quantity), the currency select, the symbol filter, the date and P&L range
// inputs, every ticker, price, figure, date, month label, currency code, the
// short uppercase legends over a figure, and the box-drawn JOURNAL EMPTY
// panel, which only lines up in a monospaced face.
//
// There is no DOM test environment in this package, so this reads the source,
// the same way the other *.lock.test.ts files do.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.resolve(__dirname, "./trading-journal.tsx"), "utf8");

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

// The first inline style object after a piece of copy.
function styleAfter(copy: string): string {
  const i = at(copy);
  const start = src.indexOf("style={{", i);
  return src.slice(start, src.indexOf("}}", start));
}

// The opening tag a piece of copy sits in.
function tagBefore(copy: string, tag: string): string {
  const i = at(copy);
  return src.slice(src.lastIndexOf(`<${tag}`, i), i);
}

function atom(name: string): string {
  const i = at(`const ${name}: React.CSSProperties = {`);
  return src.slice(i, src.indexOf("};", i));
}

const MONO = /--font-mono|\.\.\.mono\b|\.\.\.th\b|\.\.\.td\b|\binputStyle\b|\blabelStyle\b/;
// btnPrimary, btnGhost, fieldLabel, inputText and tdText are asserted sans by the atom tests below.
const SANS = /--font-sans|\.\.\.sans\b|\bbtnPrimary\b|\bbtnGhost\b|\bfieldLabel\b|\binputText\b|\btdText\b/;

function expectSans(block: string) {
  expect(block).toMatch(SANS);
  expect(block).not.toMatch(MONO);
}

describe("Trading journal type: language is sans", () => {
  it.each(["btnPrimary", "btnGhost", "fieldLabel"])("the %s atom is sans", (name) => {
    expectSans(atom(name));
  });

  it("the text-cell atom is the cell atom with sans over it", () => {
    expect(atom("tdText")).toMatch(/\.\.\.td,\s*\.\.\.sans/);
  });

  it("the text-input atom is the input atom with sans over it", () => {
    expect(atom("inputText")).toMatch(/\.\.\.inputStyle,\s*\.\.\.sans/);
  });

  it("every form label is a fieldLabel, and labelStyle is gone", () => {
    expect(src).not.toMatch(/\blabelStyle\b/);
    expect(src.match(/<label style=\{fieldLabel\}>/g)?.length).toBe(14);
  });

  it.each([
    ["the KPI sub-line", "{sub}</div>"],
    ["the streak's run word", '{isWin ? "winning" : "losing"} run'],
    ["the direction badge", "{direction.toUpperCase()}"],
    ["the status badge", "{status.toUpperCase()}"],
    ["the callout's setup", "{trade.setup}</span>"],
    ["the open-position card's setup", "{trade.setup}</div>"],
    ["a trade's notes", "{trade.notes ||"],
    ["a month with no trades", "No trades</div>"],
    ["the keyboard hint", "Tab to navigate"],
    ["Clear Filters", "Clear Filters"],
    ["the setup filter", '<option value="all">All Setups</option>'],
    ["the win-rate tooltip's setup name", "{label}</div>\n      {payload.map"],
  ])("%s is sans", (_name, copy) => {
    expectSans(styleBefore(copy));
  });

  it.each([
    ["a trade tag", "key={tag}"],
    ["the form's direction toggle", 'onClick={() => updateForm("direction", d)}'],
    ["the form's status toggle", 'onClick={() => updateForm("status", s)}'],
    ["the status filter", "onClick={() => setFilterStatus(f)}"],
    ["a row's Edit button", "onClick={(e) => { e.stopPropagation(); onEdit(trade); }}"],
  ])("%s is sans", (_name, copy) => {
    expectSans(styleAfter(copy));
  });

  it.each([
    ["the tags input", "value={form.tags}", "input"],
    ["the notes textarea", "value={form.notes}", "textarea"],
    ["the setup select", "value={form.setup}", "select"],
  ])("%s takes inputText", (_name, copy, tag) => {
    expect(tagBefore(copy, tag)).toMatch(/\binputText\b/);
    expect(tagBefore(copy, tag)).not.toMatch(/\binputStyle\b/);
  });

  it.each([
    ["a log row's setup", "{trade.setup}</td>"],
    ["a setup-analysis row's setup", "{s.setup}</td>"],
  ])("%s sits in a sans cell", (_name, copy) => {
    expectSans(tagBefore(copy, "td"));
  });

  it.each(["[ NO TRADES MATCH ]", '"Adjust or clear active filters"'])(
    "the no-match line %j is sans",
    (copy) => {
      expectSans(tagBefore(copy, "div"));
    },
  );

  it("the empty-state panel is sans around its box-drawn figure", () => {
    expectSans(styleBefore('padding: "48px 24px"'));
  });

  it("the win-rate chart's setup axis is sans", () => {
    const i = at('dataKey="setup"');
    const tick = src.slice(src.indexOf("tick={{", i), src.indexOf("}}", src.indexOf("tick={{", i)));
    expect(tick).toContain("var(--font-sans)");
  });
});

describe("Trading journal type: data stays mono", () => {
  it.each(["th", "td", "inputStyle"])("the %s atom is mono", (name) => {
    expect(atom(name)).toContain("...mono");
  });

  it.each([
    ["the KPI figure", '<span className="pnum">{value}</span>'],
    ["the open-position ticker", "{trade.ticker}\n        </span>"],
    ["the open-position ENTRY legend", ">ENTRY</div>"],
    ["the currency code", "{trade.currency}</div>"],
    ["the month label", "{m.label}"],
    ["the callout's close date", "{fmtDate(trade.closeDate ?? trade.date)} ·"],
    ["the symbol filter", '<option value="">All Symbols</option>'],
  ])("%s is mono", (_name, copy) => {
    expect(styleBefore(copy)).toMatch(/\.\.\.mono\b/);
  });

  it("a log row's ticker stays in a mono cell", () => {
    expect(tagBefore("{trade.ticker}</td>", "td")).toMatch(/\.\.\.td\b/);
  });

  it("the currency select keeps inputStyle", () => {
    expect(tagBefore("value={form.currency}", "select")).toMatch(/\.\.\.inputStyle\b/);
  });

  it("the box-drawn JOURNAL EMPTY figure is mono, since it only lines up in a monospaced face", () => {
    expect(tagBefore("JOURNAL  EMPTY", "div")).toMatch(/\.\.\.mono\b/);
  });
});
