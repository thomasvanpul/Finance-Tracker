// Lock · the ⌘K command palette follows DESIGN.md §10 (finding 928333794e02).
//
// The query field and its placeholder, the empty-state line, every command
// title and the footer hint words (navigate, execute, close) are language, so
// sans. The conversion row's title is the answer itself — "1,000 GBP = 5,400
// MYR" — so it is data and stays mono. The prompt glyph, the section legends
// (the sidebar keeps its section headings mono, §12), the row glyphs, the
// shortcut slot (keys, amounts, dates, rates) and the footer keys are data or
// legends, so mono, and stay.
//
// There is no DOM test environment in this package, so this reads the source,
// the same way the other *.lock.test.ts files do.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.resolve(__dirname, "./command-palette.tsx"), "utf8");

// Where a piece of copy is drawn: the one line that is only that copy, so a
// prop or a comment naming it does not match.
function drawnAt(copy: string): number {
  const escaped = copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\n[ \\t]*${escaped}[ \\t]*\\n`, "g");
  const hits = [...src.matchAll(re)];
  if (hits.length !== 1) throw new Error(`${copy}: ${hits.length} drawn lines, expected 1`);
  return src.indexOf(copy, hits[0].index);
}

// The style block that draws a piece of copy.
function styleBefore(copy: string): string {
  const at = drawnAt(copy);
  return src.slice(src.lastIndexOf("style={{", at), at);
}

// The style block of the element that opens with `opener`.
function styleOf(opener: string): string {
  const at = src.indexOf(opener);
  if (at < 0) throw new Error(`${opener}: not found`);
  const start = src.indexOf("style={{", at);
  return src.slice(start, src.indexOf("}}", start));
}

function expectSans(block: string) {
  expect(block).toContain("--font-sans");
  expect(block).not.toContain("--font-mono");
}

describe("Command palette type: language is sans", () => {
  it("draws the query field and its placeholder in sans", () =>
    expectSans(styleOf("ref={inputRef}")));

  it("draws the empty-state line in sans", () => expectSans(styleBefore("NO RESULTS")));

  it("draws command titles in sans, except the conversion answer", () => {
    const block = styleBefore("{cmd.title}");
    expect(block).toMatch(/cmd\.section === "convert" \? "var\(--font-mono\)" : "var\(--font-sans\)"/);
  });

  it("draws the footer hint words in sans", () =>
    expectSans(styleOf("function HintItem")));
});

describe("Command palette type: data and legends stay mono", () => {
  it.each(["&gt;", "{SECTION_LABELS[section]}", "{cmd.icon}", "{cmd.shortcut}", "{keys}"])(
    "keeps %s mono", (copy) => expect(styleBefore(copy)).toContain("--font-mono"));
});
