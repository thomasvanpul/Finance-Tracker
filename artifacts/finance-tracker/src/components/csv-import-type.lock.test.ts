// Lock · the CSV / OFX / QIF import modal follows DESIGN.md §10
// (finding 928333794e02).
//
// The modal is opened from /transactions. Language is sans: the modal itself
// (so every sentence it holds inherits sans), its title, the two field labels
// (Bank / Provider, Import into account), the provider buttons, the account
// select, the drop-zone line, the format hint, "Import complete", the Errors
// heading and its messages, and all four buttons (Cancel, Import, Import
// Another, Done). This matches the /import page's lock.
//
// Data stays mono: a chosen file's name, the size-and-extension line and the
// extension list under the drop zone, and the Added / Skipped legends with
// their counts. The ✓ ↑ ○ × glyphs are symbols and are left as they were.
//
// There is no DOM test environment in this package, so this reads the source,
// the same way the other *.lock.test.ts files do.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.resolve(__dirname, "./csv-import.tsx"), "utf8");

// Where a piece of copy sits; it must occur exactly once.
function at(copy: string): number {
  const first = src.indexOf(copy);
  if (first < 0) throw new Error(`${copy}: not found`);
  if (src.indexOf(copy, first + 1) >= 0) throw new Error(`${copy}: occurs more than once`);
  return first;
}

// The nearest style object above a piece of copy, up to the copy.
function styleBefore(copy: string): string {
  const i = at(copy);
  return src.slice(src.lastIndexOf("style={{", i), i);
}

const MONO = /--font-mono/;
const SANS = /--font-sans/;

describe("CSV import type: language is sans", () => {
  it("the modal is sans, so its sentences inherit it", () => {
    const block = styleBefore("{/* Header */}");
    expect(block).toMatch(SANS);
    expect(block).not.toMatch(MONO);
  });

  it.each([
    ["the title", "Import CSV / OFX / QIF"],
    ["the provider field label", "Bank / Provider"],
    ["each provider button", "{p.label}"],
    ["the account field label", "Import into account"],
    ["the account select", '<option value="">— select account —</option>'],
    ["the drop-zone line's own div", "{/* A file name is data; the prompt is a sentence. */}"],
    ["the format hint", '"OFX/QFX: exported from most banks'],
    ["Cancel", "Cancel\n"],
    ["Import", '{isPending ? "Importing…" : "Import"}'],
    ["Import complete", "Import complete"],
    ["the Errors heading", ">Errors</div>"],
    ["each error message", "· {e}"],
    ["Import Another", "Import Another"],
    ["Done", "Done\n"],
  ])("%s is not mono", (_name, copy) => {
    expect(styleBefore(copy)).not.toMatch(MONO);
  });

  it("the drop-zone prompt is outside the file name's mono span", () => {
    const i = at('"Drop .csv file here or click to browse"');
    expect(src.lastIndexOf("</span>", i)).toBeGreaterThan(src.lastIndexOf("<span", i));
  });

  it("no button in the modal sets mono", () => {
    const buttons = src.match(/<button[\s\S]*?<\/button>/g) ?? [];
    expect(buttons.length).toBe(6);
    for (const b of buttons) expect(b).not.toMatch(MONO);
  });
});

describe("CSV import type: data stays mono", () => {
  it.each([
    ["a chosen file's name", "{file.name}"],
    ["the size-and-extension line", '"CSV · OFX · QIF"'],
    ["each Added / Skipped legend", "{item.label}</div>"],
    ["each Added / Skipped count", "{item.value}</div>"],
  ])("%s is mono", (_name, copy) => {
    expect(styleBefore(copy)).toMatch(MONO);
  });
});
