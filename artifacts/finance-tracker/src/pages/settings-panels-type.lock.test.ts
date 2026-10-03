// Lock · the Currency, Rules, Widgets, Data and Shortcuts panels in
// settings.tsx follow DESIGN.md §10.
//
// The panel descriptions, the rules empty state, the Keyword / Category field
// labels, the keyword input, the category select, + Add, the widgets footer,
// the export sentence and the shortcut action names are language, so sans. A
// rule's keyword and category are names a person wrote, so sans too.
//
// Left in mono, and asserted here so a later pass does not take them: the FX
// table's header and its currency pairs, the shortcut keys, and the header
// rows over the rules and shortcuts tables (a header row stays one family,
// the call taken in the 6 Sep rollout).
//
// There is no DOM test environment in this package, so this reads the source,
// the same way the other *.lock.test.ts files do.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const settings = readFileSync(path.resolve(__dirname, "./settings.tsx"), "utf8");

// The source line that draws a piece of copy.
function lineWith(copy: string): string {
  const lines = settings.split("\n").filter((l) => l.includes(copy));
  if (lines.length !== 1) throw new Error(`${copy}: expected one line, found ${lines.length}`);
  return lines[0];
}

const LANGUAGE = [
  "All amounts will be converted to this currency for display.",
  "Override live FX rates for multi-currency transaction conversion.",
  "When a transaction description contains the keyword",
  "{rule.contains}</td>",
  "{rule.category}</span>",
  "No rules yet. Add one below.",
  ">Keyword</div>",
  'placeholder="keyword"',
  ">Category</div>",
  "value={newRuleCategory}",
  "onClick={handleAddCatRule} disabled",
  "Export All Data downloads your account",
  "{action}</td>",
];

describe("Settings panels type", () => {
  it.each(LANGUAGE)("draws %s in sans", (copy) => {
    const line = lineWith(copy);
    expect(line).not.toContain("--font-mono");
    expect(line).toContain("--font-sans");
  });

  it("draws the widgets footer in sans", () => {
    const at = settings.indexOf("Enabled widgets appear on the Dashboard page.");
    const style = settings.slice(settings.lastIndexOf("style={{", at), at);
    expect(style).not.toContain("--font-mono");
    expect(style).toContain("--font-sans");
  });

  it("does not set mono on the rules footnote", () => {
    expect(lineWith("Rules apply when adding transactions")).not.toMatch(/<Text[^>]*\bmono\b/);
  });

  it("keeps the FX pairs, the shortcut keys and the table headers in mono", () => {
    expect(lineWith("{baseCur}/{pair}</td>")).toContain("--font-mono");
    expect(lineWith(">{key}</kbd>")).toContain("--font-mono");
    expect(lineWith('["Pair",`Rate')).toContain("--font-mono");
    expect(lineWith('["Keyword","","Category",""]')).toContain("--font-mono");
    expect(lineWith('["Shortcut","Action"]')).toContain("--font-mono");
  });
});
