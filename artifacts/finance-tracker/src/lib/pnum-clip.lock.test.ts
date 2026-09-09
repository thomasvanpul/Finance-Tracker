// Lock · a financial figure may not be clipped by an ANCESTOR
// ────────────────────────────────────────────────────────────────────────────
//
// `pnum-invariant.test.ts` already forbids `overflow: hidden` and
// `textOverflow` on the `.pnum` element itself. Its header lists, as a legal
// escape:
//
//     "Wrap the figure in its own element (a parent can be overflow:
//      hidden; the .pnum span does not carry it)."
//
// That escape is exactly the shape of the defect that shipped. In customize
// mode the NET WORTH widget printed `£229,6` for `£229,628.27`, `£214,1` for
// `£214,178.48`, `£15,44` for `£15,449.79` and `£212,9` for `£212,991.56` —
// no ellipsis, no fade, no signal of any kind that digits were missing. The
// `.pnum` div carried neither property. Its PARENT carried both halves of the
// recipe:
//
//     minWidth: 0        lets a grid / flex track shrink below its content
//     overflow: hidden   hides the digits that no longer fit
//
// Either alone is ordinary and usually correct. Together, around a figure,
// they are a silent wrong number — which CLAUDE.md names as the worst class of
// defect this app can ship: "£11,371 clipped to £1… reads as £1."
//
// Rule: no JSX element that sets BOTH `overflow: "hidden"` and `minWidth: 0`
// may contain a `.pnum` descendant.
//
// The two are matched together on purpose. `overflow: hidden` alone is how
// every progress bar, sparkline clip and rounded avatar in this codebase is
// drawn, and flagging all of them would produce a lock nobody can keep green.
// `minWidth: 0` alone is the standard fix for a flex child that refuses to
// shrink. It is the pair that clips a number.
//
// Escapes, in order of preference:
//   1. Let the container reflow instead of squeezing — `grid-template-columns:
//      repeat(auto-fit, minmax(<figure width>, 1fr))` drops a column rather
//      than narrowing one. This is what net-worth.tsx now does.
//   2. Guarantee the width (a fixed track, or `min-width` at the figure's
//      measured size) so the figure is never asked for less than it needs.
//   3. Render the label alone or the value alone below a width threshold —
//      DESIGN.md's stated answer, and CLAUDE.md's: "in full or not at all".
//
// There is no allowlist. A figure that can be cropped is a figure that can lie,
// and the three escapes above cover every case this codebase has produced.

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

const files = walk(SRC_DIR).filter(
  (f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx") && !f.endsWith("pnum-clip.lock.test.ts"),
);

type TagKind = "open" | "selfClose" | "close";
interface Tag {
  kind: TagKind;
  line: number;
  start: number; // index of `<`
  end: number;   // index just past `>`
  text: string;
}

// Scan JSX tags brace- and string-aware, the same way pnum-invariant.test.ts
// does, but keeping closing and self-closing tags too so an element's subtree
// can be found by depth rather than guessed at by line distance.
function tags(source: string): Tag[] {
  const out: Tag[] = [];
  const n = source.length;
  let i = 0;
  let line = 1;
  while (i < n) {
    const ch = source[i]!;
    if (ch === "\n") { line += 1; i += 1; continue; }
    if (ch !== "<") { i += 1; continue; }
    const next = source[i + 1] ?? "";
    const isClose = next === "/";
    // `<` followed by a letter opens a tag; `</` closes one. Anything else
    // (a comparison, a generic, `<!--`) is not a tag.
    if (!isClose && !/[A-Za-z]/.test(next)) { i += 1; continue; }
    if (isClose && !/[A-Za-z>]/.test(source[i + 2] ?? "")) { i += 1; continue; }
    const startLine = line;
    let depth = 0;
    let inStr: '"' | "'" | "`" | null = null;
    let j = i;
    let closed = false;
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
        const text = source.slice(i, j + 1);
        const selfClosing = /\/\s*>$/.test(text);
        out.push({
          kind: isClose ? "close" : selfClosing ? "selfClose" : "open",
          line: startLine,
          start: i,
          end: j + 1,
          text,
        });
        i = j + 1;
        closed = true;
        break;
      }
      j += 1;
    }
    if (!closed) i = n;
  }
  return out;
}

const HAS_OVERFLOW_HIDDEN = /\boverflow\s*:\s*["']hidden["']/;
const HAS_MIN_WIDTH_0 = /\bminWidth\s*:\s*0\b/;
// className="pnum", className="a pnum b", className={`… pnum …`},
// className={cx("pnum", …)} — the same shapes pnum-invariant.test.ts accepts.
const HAS_PNUM =
  /className\s*=\s*(?:"[^"]*\bpnum\b[^"]*"|'[^']*\bpnum\b[^']*'|\{[^}]*\bpnum\b[^}]*\})/;

interface Violation {
  file: string;
  line: number;
  snippet: string;
}

// The subtree of the opening tag at index `k` is everything up to its matching
// close, found by walking the tag list with a depth counter. A fragment or an
// unbalanced region (JSX inside a conditional expression that the scanner
// cannot pair) falls back to "no subtree", which under-reports rather than
// inventing a violation.
function subtree(all: Tag[], k: number, source: string): string | null {
  const open = all[k]!;
  let depth = 1;
  for (let m = k + 1; m < all.length; m += 1) {
    const t = all[m]!;
    if (t.kind === "selfClose") continue;
    if (t.kind === "open") depth += 1;
    else depth -= 1;
    if (depth === 0) return source.slice(open.end, t.start);
  }
  return null;
}

function scan(file: string, source: string): Violation[] {
  const out: Violation[] = [];
  const all = tags(source);
  for (let k = 0; k < all.length; k += 1) {
    const tag = all[k]!;
    if (tag.kind !== "open") continue;
    if (!HAS_OVERFLOW_HIDDEN.test(tag.text)) continue;
    if (!HAS_MIN_WIDTH_0.test(tag.text)) continue;
    const inner = subtree(all, k, source);
    if (inner === null) continue;
    if (!HAS_PNUM.test(inner)) continue;
    out.push({
      file,
      line: tag.line,
      snippet: tag.text.replace(/\s+/g, " ").slice(0, 200),
    });
  }
  return out;
}

describe("pnum clip lock — no ancestor may crop a financial figure", () => {
  it("no element setting both overflow:'hidden' and minWidth:0 contains a .pnum", () => {
    const all: Violation[] = [];
    for (const file of files) {
      all.push(...scan(relative(REPO_ROOT, file), readFileSync(file, "utf8")));
    }
    expect(
      all,
      all.length === 0
        ? ""
        : `${all.length} figure(s) can be cropped by an ancestor:\n` +
          all.map((v) => `  ${v.file}:${v.line}\n    ${v.snippet}`).join("\n") +
          `\n\nBoth halves of the recipe are on one element wrapping a .pnum:\n` +
          `  minWidth: 0       lets the track shrink below the figure\n` +
          `  overflow: hidden  hides the digits that no longer fit\n` +
          `The result is a readable number that is wrong. See this file's header ` +
          `for the three escapes; the preferred one is to let the container ` +
          `reflow (auto-fit / minmax) instead of squeezing the cell.`,
    ).toEqual([]);
  });

  it("the walker actually finds a planted violation", () => {
    // A lock that silently matches nothing passes forever. This proves the
    // subtree walk reaches a .pnum nested two levels below the recipe.
    const planted = `
      export function X() {
        return (
          <div style={{ overflow: "hidden", minWidth: 0 }}>
            <div>
              <span className="pnum">£229,628.27</span>
            </div>
          </div>
        );
      }
    `;
    expect(scan("planted.tsx", planted)).toHaveLength(1);
  });

  it("does not flag the recipe when no figure is inside it", () => {
    const benign = `
      export function Y() {
        return (
          <div style={{ overflow: "hidden", minWidth: 0 }}>
            <span>Coffee</span>
          </div>
        );
      }
    `;
    expect(scan("benign.tsx", benign)).toEqual([]);
  });

  it("does not flag overflow:'hidden' on its own", () => {
    const bar = `
      export function Z() {
        return (
          <div style={{ overflow: "hidden", height: 2 }}>
            <span className="pnum">£1.00</span>
          </div>
        );
      }
    `;
    expect(scan("bar.tsx", bar)).toEqual([]);
  });
});
