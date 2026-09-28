// Lock · a financial figure may not sit in a fixed-width slot
// ────────────────────────────────────────────────────────────────────────────
//
// DESIGN.md §8: "Numbers may not give. A `.pnum` in a cell gets
// `flex-shrink: 0` and a slot that is guaranteed to hold the widest value the
// screen can show. The slot gives, the digits do not." And: "Fixed pixel
// widths on a numeric column are allowed only when the widest value the
// column can carry has been checked against them … The 7-figure balance and
// the 5-character currency code are the test cases, not the 4-figure ones the
// seed data happens to contain."
//
// A `width: 58` on a `.pnum` is a slot that cannot give. Chosen against seed
// data, it holds `£1,234.56` and then a seven-figure balance or a five-digit
// index level lands in it: `.pnum` is `white-space: nowrap`, so the digits
// run past the slot and over the neighbour — a figure printed across another
// figure. The ledger shipped exactly that (`130px` AMOUNT, fixed in 8939884)
// and the other fixed slots were recorded as finding 73749faf2868.
//
// Rule: no JSX element carrying the `pnum` class may set a fixed pixel
// `width` (a number, or a "<n>px" string). `minWidth` / `maxWidth` / a
// percentage / `auto` are fine.
//
// Escape: reserve the slot with `minWidth: <same n>` and `flexShrink: 0`.
// Rows keep the column they have today for every value that already fits,
// and a wider value widens its own slot instead of colliding. That is §8
// step 1. A column that must stay aligned across rows at any width sizes the
// track from its content instead (`grid-template-columns: … auto`, or the
// ledger's widest-formatted-value width).
//
// There is no allowlist. §8 allows a fixed width "checked against the widest
// value", and nothing in source can prove that check still holds after the
// data changes; a minWidth costs nothing where it did.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const SRC_DIR = join(dirname(__filename), "..");
const REPO_ROOT = join(SRC_DIR, "..", "..", "..");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === "generated") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (st.isFile()) out.push(full);
  }
  return out;
}

const files = walk(SRC_DIR).filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"));

// Opening JSX tags, brace- and string-aware — the scanner pnum-invariant.test.ts
// uses, with one change: after a tag it resumes one character in rather than
// past the tag, so JSX nested inside a prop (`right={<span …/>}`,
// `content={(p) => <div …/>}`) is visited as its own tag. The outer tag is
// then skipped in `fixedWidthPnums`, or the nested child's width and class
// would be charged to it.
function openingTags(source: string): { line: number; text: string }[] {
  const tags: { line: number; text: string }[] = [];
  const n = source.length;
  let i = 0;
  let line = 1;
  while (i < n) {
    const ch = source[i]!;
    if (ch === "\n") { line += 1; i += 1; continue; }
    if (ch !== "<") { i += 1; continue; }
    if (!/[A-Za-z]/.test(source[i + 1] ?? "")) { i += 1; continue; }
    const startLine = line;
    let depth = 0;
    let inStr: '"' | "'" | "`" | null = null;
    let j = i;
    while (j < n) {
      const c = source[j]!;
      if (c === "\n") line += 1;
      if (inStr) {
        if (c === "\\") { j += 2; continue; }
        if (c === inStr) { inStr = null; j += 1; continue; }
        j += 1; continue;
      }
      if (c === '"' || c === "'" || c === "`") { inStr = c; j += 1; continue; }
      if (c === "{" || c === "(" || c === "[") { depth += 1; j += 1; continue; }
      if (c === "}" || c === ")" || c === "]") { depth -= 1; j += 1; continue; }
      if (c === ">" && depth === 0) {
        tags.push({ line: startLine, text: source.slice(i, j + 1) });
        break;
      }
      j += 1;
    }
    // Resume just inside the tag so nested tags are found; restore the line
    // count, which the inner walk advanced to the tag's end.
    line = startLine;
    i += 1;
  }
  return tags;
}

const HAS_PNUM =
  /className\s*=\s*(?:"[^"]*\bpnum\b[^"]*"|'[^']*\bpnum\b[^']*'|\{[^}]*\bpnum\b[^}]*\})/;
// `width:` as its own key — not minWidth / maxWidth / borderWidth — whose
// value, or either branch of a conditional value, is a pixel literal: a bare
// number or a "<n>px" string. `width: isMobile ? undefined : 130` is a fixed
// slot on desktop, and the first version of this lock missed exactly that.
const WIDTH_VALUE = /(?<![A-Za-z-])width\s*:\s*([^,}]*)/g;
const PX_OPERAND = /(?:^|[?:])\s*(?:\d+(?:\.\d+)?|["'`]\d+(?:\.\d+)?px["'`])\s*(?=$|[?:])/;
function hasFixedWidth(tag: string): boolean {
  for (const m of tag.matchAll(WIDTH_VALUE)) {
    if (PX_OPERAND.test(m[1]!.trim())) return true;
  }
  return false;
}

// A tag whose props hold JSX: its own attributes cannot be told apart from its
// children's by a regex, and every nested tag is scanned on its own anyway.
const HOLDS_JSX = /<[A-Za-z]/;
// An <input>'s value scrolls inside its own box — it cannot print over a
// neighbour, which is the defect this lock is about — and swapping its width
// for a minWidth would let it grow to the browser's default size.
const IS_INPUT = /^<(?:input|Input)\b/;

export function fixedWidthPnums(source: string): { line: number; snippet: string }[] {
  return openingTags(source)
    .filter((t) => !IS_INPUT.test(t.text) && !HOLDS_JSX.test(t.text.slice(1)))
    .filter((t) => HAS_PNUM.test(t.text) && hasFixedWidth(t.text))
    .map((t) => ({ line: t.line, snippet: t.text.replace(/\s+/g, " ").slice(0, 200) }));
}

describe("pnum fixed-width lock — a figure's slot gives, the digits do not", () => {
  it("no .pnum element sets a fixed pixel width", () => {
    const found: string[] = [];
    for (const file of files) {
      for (const v of fixedWidthPnums(readFileSync(file, "utf-8"))) {
        found.push(`  ${relative(REPO_ROOT, file)}:${v.line}  ${v.snippet}`);
      }
    }
    if (found.length > 0) {
      throw new Error(
        `Found ${found.length} .pnum element(s) in a fixed-width slot (DESIGN.md §8).\n` +
        `Reserve the slot with minWidth instead, so a wider value widens it rather than\n` +
        `colliding with its neighbour. See lib/pnum-fixed-width.lock.test.ts.\n\n${found.join("\n")}`,
      );
    }
    expect(found).toEqual([]);
  });

  it("finds a planted fixed width, in both spellings", () => {
    expect(fixedWidthPnums(`<span className="pnum" style={{ width: 58 }}>x</span>`)).toHaveLength(1);
    expect(fixedWidthPnums(`<div\n  className="a pnum"\n  style={{ fontSize: 11, width: "130px" }}\n>x</div>`)).toHaveLength(1);
    expect(fixedWidthPnums(`<div className="pnum" style={{ width: isMobile ? undefined : 130, padding: 4 }}>x</div>`)).toHaveLength(1);
  });

  it("does not flag minWidth, maxWidth, percentages or a width on a non-figure", () => {
    expect(fixedWidthPnums(`<span className="pnum" style={{ minWidth: 58, maxWidth: 200 }}>x</span>`)).toEqual([]);
    expect(fixedWidthPnums(`<span className="pnum" style={{ width: "100%" }}>x</span>`)).toEqual([]);
    expect(fixedWidthPnums(`<span className="pnum" style={{ width: isMobile ? "100%" : "auto" }}>x</span>`)).toEqual([]);
    expect(fixedWidthPnums(`<span className="pnum" style={{ width: \`\${w}px\` }}>x</span>`)).toEqual([]);
    expect(fixedWidthPnums(`<span style={{ width: 58 }}>x</span>`)).toEqual([]);
    expect(fixedWidthPnums(`<Input type="number" className="pnum" style={{ width: 100 }} />`)).toEqual([]);
  });

  it("charges a width inside a JSX prop to the nested element, not its host", () => {
    const src = `<PanelHeader\n  right={<span className="pnum" style={{ width: 40 }}>x</span>}\n/>`;
    const found = fixedWidthPnums(src);
    expect(found).toHaveLength(1);
    expect(found[0]!.snippet.startsWith("<span")).toBe(true);
    expect(found[0]!.line).toBe(2);
  });
});
