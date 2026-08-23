// Lock #15 — no viewport arithmetic in page roots.
//
// A page that sets `height: calc(100vh - N)` guesses the height of
// the chrome above <main> at N pixels. When the guess is wrong (it
// always is — 48 wanted 72, 64 wanted 72, both discovered by
// measurement in scripts/src/scroll-audit.ts), the page overflows
// <main> and a second scrollbar appears. If someone then tries to
// "fix" it by hiding <main>'s overflow, the child gets CLIPPED
// rather than shrunk — on /ai-coach that clipped the composer
// input, a control that stopped working while looking present.
//
// The correct pattern (Approach C, applied in commit 4f95155) is
// flex-shrinking into the space <main> gives you:
//   <main>              overflow:hidden, display:flex, flex-column
//   page-root           flex:1, minHeight:0
// No arithmetic. If more chrome lands above <main> tomorrow, the
// page still fits because the flex parent's height simply changes.
//
// This rule bans the arithmetic itself so the regression can't
// re-enter through a well-meaning "I just want to size this to the
// viewport" edit. `minHeight: calc(100vh - N)` is deliberately NOT
// banned — several pages use it to make empty-state cards fill
// visible space, which grows past viewport when content arrives
// and plays nicely with <main>'s scroll on unlocked routes.
//
// Same test-lock shape as the AI leak-lock (rule 3 whitelist
// pattern). Adding a route to VIEWPORT_LOCKED_ROUTES in layout.tsx
// is the correct response if a new page needs viewport-lock
// behaviour, not adding `height: calc(...)` to the page root.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = join(dirname(__filename), "..", "..", "..", "..");
const PAGES_DIR = join(REPO_ROOT, "artifacts", "finance-tracker", "src", "pages");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (st.isFile() && (full.endsWith(".ts") || full.endsWith(".tsx"))) out.push(full);
  }
  return out;
}

// Detection strategy (measured, not naive):
//
//   For every occurrence of `calc(100vh` or `calc(100dvh`, walk back
//   from that position on the same line and find the nearest
//   property assignment (`height:`, `minHeight:`, `maxHeight:`,
//   `height=`, etc). If the nearest one is a plain `height` (not
//   `minHeight` or `maxHeight`), flag.
//
//   This handles ternaries — `height: cond ? "auto" : "calc(100vh - 48)"`
//   — which a "must appear directly after height:" regex misses.
//   And it doesn't false-fire on `style={{ height: 40, minHeight:
//   "calc(100vh - 260)" }}` because the nearest assignment to the
//   calc is `minHeight`, not `height`.
//
//   Case matters: `height` is lowercase (both CSS property keys
//   and StackProps prop names); `minHeight` / `maxHeight` are
//   camelCase. Word-boundary + case-sensitivity together mean
//   `\bheight\b` never matches inside `minHeight` (the "H" is
//   capital and there's no word boundary between "min" and
//   "Height"). This is the sound part of the ban.
//
// Comments are stripped first so historical references to the
// removed pattern don't trip the lock.
const CALC_VIEWPORT = /calc\(100(?:vh|dvh)\b/g;
// Any property assignment: minHeight, maxHeight, or plain height.
// We scan for ALL matches before the calc and take the last one —
// simpler and more robust than requiring the assignment to be the
// last thing (a `height: cond ? "auto" : "calc(...)"` ternary has
// quotes between `height:` and the calc that broke earlier regex
// versions).
const PROP_ANY = /\b(minHeight|maxHeight|height)\s*[:=]/g;

// Strip line comments and block comments so a comment describing
// the banned pattern (this test's docstring, or a "removed X" note
// in a page) doesn't false-trigger. Simple stripper — good enough
// for the pattern above, which is only meaningful in expression
// position.
function stripComments(src: string): string {
  // Remove /* ... */ block comments (single or multi-line).
  let out = src.replace(/\/\*[\s\S]*?\*\//g, "");
  // Remove // line comments (respect quotes: don't strip // inside strings).
  const lines = out.split("\n");
  const stripped: string[] = [];
  for (const line of lines) {
    let inString: string | null = null;
    let cut = line.length;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inString) {
        if (c === inString && line[i - 1] !== "\\") inString = null;
      } else if (c === '"' || c === "'" || c === "`") {
        inString = c;
      } else if (c === "/" && line[i + 1] === "/") {
        cut = i;
        break;
      }
    }
    stripped.push(line.slice(0, cut));
  }
  return stripped.join("\n");
}

interface Hit { file: string; line: number; snippet: string }

function scan(): Hit[] {
  const hits: Hit[] = [];
  for (const file of walk(PAGES_DIR)) {
    if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;
    const src = stripComments(readFileSync(file, "utf-8"));
    // Per-line detection so we can walk backwards from a calc match
    // to its nearest property assignment.
    const lines = src.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      CALC_VIEWPORT.lastIndex = 0;
      let calcMatch: RegExpExecArray | null;
      while ((calcMatch = CALC_VIEWPORT.exec(line)) !== null) {
        const before = line.slice(0, calcMatch.index);
        // Find ALL property assignments in `before`; take the last.
        PROP_ANY.lastIndex = 0;
        let lastPropMatch: RegExpExecArray | null = null;
        let m: RegExpExecArray | null;
        while ((m = PROP_ANY.exec(before)) !== null) lastPropMatch = m;
        // If no property assignment on the same line, we don't
        // know what this calc is bound to — could be a JSX text
        // node, an unrelated string, etc. Skip; page-root height
        // usage is always property-assigned on the same line.
        if (!lastPropMatch) continue;
        const prop = lastPropMatch[1];
        // minHeight and maxHeight are ALLOWED to use viewport
        // arithmetic — that's the empty-state-fills-viewport
        // pattern several pages use legitimately.
        if (prop === "minHeight" || prop === "maxHeight") continue;
        // prop is "height" — banned.
        hits.push({
          file: relative(PAGES_DIR, file),
          line: i + 1,
          snippet: line.trim().slice(0, 120),
        });
      }
    }
  }
  return hits;
}

describe("viewport-arithmetic lock (#15)", () => {
  it("no page under src/pages/ uses `height: calc(100vh|100dvh - N)`", () => {
    const hits = scan();
    if (hits.length > 0) {
      throw new Error(
        `Viewport arithmetic is banned in page roots (pages/**). Chrome above <main> changes and this pattern hard-codes a guess at it — when the guess is wrong the page overflows <main> and produces a second scrollbar; when someone tries to "fix" the overflow by clipping <main>, the child gets clipped instead of shrunk (on /ai-coach that clipped the composer input, a control that stopped working while looking present).\n\n` +
        `Correct pattern: add the route to VIEWPORT_LOCKED_ROUTES in layout.tsx and give the page root \`flex:1; minHeight:0\` (or \`<VStack grow minHeight0>\`). See commit 4f95155 (settings + ai-coach applied this shape).\n\n` +
        `minHeight: calc(...) is NOT banned — that's a legitimate way to make empty-state cards fill visible space.\n\n` +
        `Offenders:\n  ${hits.map((h) => `${h.file}:${h.line} — ${h.snippet}`).join("\n  ")}`,
      );
    }
    expect(hits).toEqual([]);
  });
});
