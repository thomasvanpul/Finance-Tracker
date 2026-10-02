// Lock · the Import page follows DESIGN.md §10 (finding 928333794e02).
//
// The step labels, the drop-zone line, every sentence, the field labels, the
// buttons (primary, ghost, presets, amount format), both selects, the
// validation line, the duplicate banner, the persona tip, the completion
// banner, the row's description and category, and the type and status badges
// are language, so sans. The raw CSV (textarea, example, Step 2 preview
// table), the file extensions, column headers, dates, amounts, counts, the
// KPI legends and values, the step numbers, the progress readout and the
// recent-imports list are data or legends, so mono, and stay.
//
// Where a sentence carries a figure, the figure is a .pnum span inside the
// sans sentence.
//
// There is no DOM test environment in this package, so this reads the source,
// the same way the other *.lock.test.ts files do.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.resolve(__dirname, "./import.tsx"), "utf8");

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

// A module-level style atom, from its declaration to its closing brace.
function atom(name: string): string {
  const start = at(`const ${name}: React.CSSProperties = {`);
  return src.slice(start, src.indexOf("};", start));
}

function expectSans(block: string) {
  expect(block).toContain("--font-sans");
  expect(block).not.toContain("--font-mono");
  expect(block).not.toMatch(/\.\.\.mono\b/);
}

function expectMono(block: string) {
  expect(block).toMatch(/--font-mono|\.\.\.mono\b|className="pnum"/);
  expect(block).not.toContain("--font-sans");
}

describe("Import type: language is sans", () => {
  it.each(["labelStyle", "BTN_PRIMARY", "BTN_GHOST"])("atom %s", (name) => {
    expectSans(atom(name));
  });

  it.each([
    '{dragging ? "DROP TO UPLOAD"',
    "Paste your bank export below",
    "OR PASTE BELOW",
    "Tell Numeris which CSV column",
    '{selected && "✓ "}{label}',
    "{step.label}",
    "{preset.label}",
    '<option value="">— none —</option>',
    '<option value="">— select account —</option>',
    "Required to import",
    "transactions selected",
    "potential duplicate",
    "{row.description}",
    "{row.category}",
    "{row.type.toUpperCase()}",
    "<X size={10} />\n            ERROR",
    ">…</span>",
    "DUP\n",
    "READY\n",
    "Import complete — ",
  ])("%s", (copy) => {
    expectSans(styleBefore(copy));
  });

  it("the persona tip", () => {
    expectSans(styleAfter("const color = PERSONA_COLORS"));
  });
});

describe("Import type: data stays mono", () => {
  it.each(["th", "td"])("atom %s", (name) => {
    expectMono(atom(name));
  });

  it.each([
    "{new Date(entry.date).toLocaleDateString",
    ".csv · .ofx · .qif",
    'line{lineCount !== 1 ? "s" : ""}',
    "{EXAMPLE_CSV}\n          </pre>",
    '{done ? "✓" : step.n}',
    "\n              {k.label}",
    "{k.value}",
    '<span className="pnum">{progress}</span> / ',
    ">Recent imports<",
  ])("%s", (copy) => {
    expectMono(styleBefore(copy));
  });

  it("the CSV textarea", () => {
    expectMono(styleAfter("onChange={(e) => onCsvChange(e.target.value)}"));
  });
});
