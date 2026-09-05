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
const FT_SRC = join(REPO_ROOT, "artifacts", "finance-tracker", "src");
const PAGES_DIR = join(FT_SRC, "pages");

// Scan roots — widened from pages/ only, after four sites shipped with
// the flash pattern outside pages/ (App.tsx:64, auth-gate.tsx:302,
// PhoneShell.tsx:59, notifications-panel.tsx:594). The original scope
// covered where pages LIVE, not where the flash actually renders.
const SCAN_ROOTS: readonly string[] = [
  PAGES_DIR,
  join(FT_SRC, "components"),
  join(FT_SRC, "App.tsx"),
  join(FT_SRC, "main.tsx"),
];

// Files where full-viewport fill is legitimate — no shell above them at
// render time, so filling the viewport is the right response, not a bug.
// Every entry justifies itself to a reviewer. Weakening the ban with a
// new EXEMPT entry is a visible diff.
const EXEMPT_FILES: ReadonlySet<string> = new Set([
  // Boot-time error rendering, before ThemeProvider / AuthGate / any
  // shell mounts. Full viewport is correct — there's no chrome to fit
  // inside. Deliberately allowed.
  "artifacts/finance-tracker/src/main.tsx",
  // Sign-in page root at auth-gate.tsx:786 is legitimately a full-page
  // container — displayed BEFORE any shell mounts, no chrome above.
  // The pre-auth loading placeholder at :302 was fixed in the same
  // commit that widened this lock (renders PhoneScreenSkeleton inside
  // a flex column instead). File-level exemption because the sign-in
  // form's minHeight:100dvh is a legitimate page-root fill.
  "artifacts/finance-tracker/src/components/auth-gate.tsx",
  // Sits between AuthGate and the shell (App.tsx: AuthGate →
  // PreferencesGate → OnboardingGate). While it holds children for the
  // one preferences round-trip there is no shell mounted above it, so
  // the placeholder fills the viewport exactly as auth-gate's session
  // placeholder does — same skeleton, same flex column.
  "artifacts/finance-tracker/src/components/preferences-gate.tsx",
]);

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

// Enumerate every source file under SCAN_ROOTS. Roots may be directories
// (walked recursively) or single files (added directly).
function collectSources(): string[] {
  const files: string[] = [];
  for (const root of SCAN_ROOTS) {
    const st = statSync(root);
    if (st.isDirectory()) files.push(...walk(root));
    else if (st.isFile()) files.push(root);
  }
  return files;
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

// Ban B — bare 100vh / 100dvh on `minHeight` or `height` OUTSIDE
// src/pages/. Inside pages/ this pattern is a legitimate empty-state
// fill (a page root with no data yet growing to visible space). Inside
// shell / component code (App.tsx, PhoneShell, layout children,
// notifications, Suspense fallbacks) it is the "cream rectangle" flash
// pattern the shape-matching skeleton replaces — it overflows the shell
// slot and produces layout shift when real content arrives.
//
// Matches: minHeight: "100vh" | "100dvh"  (string or template literal
// value forms). Deliberately NOT a `calc()` match — Ban A already covers
// `height: calc(100vh - N)` under both scopes.
const BARE_VIEWPORT_MIN_H =
  /\b(minHeight|height)\s*[:=]\s*(?:["'`])100(?:vh|dvh)(?:["'`])/g;

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

interface Hit { file: string; line: number; snippet: string; kind: "A" | "B" }

function scan(): Hit[] {
  const hits: Hit[] = [];
  for (const file of collectSources()) {
    if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;
    const rel = relative(REPO_ROOT, file);
    if (EXEMPT_FILES.has(rel)) continue;
    const src = stripComments(readFileSync(file, "utf-8"));
    // Per-line detection so we can walk backwards from a calc match
    // to its nearest property assignment.
    const lines = src.split("\n");
    const inPages = file.startsWith(PAGES_DIR);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // ── Ban A · height: calc(100vh|100dvh - N). Applies everywhere. ──
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
        // arithmetic (Ban A specifically) — that's the empty-state
        // fills-viewport pattern several pages use legitimately.
        // Ban B (below) governs bare 100vh|100dvh on minHeight.
        if (prop === "minHeight" || prop === "maxHeight") continue;
        hits.push({
          file: rel,
          line: i + 1,
          snippet: line.trim().slice(0, 120),
          kind: "A",
        });
      }
      // ── Ban B · minHeight|height: "100vh"|"100dvh" OUTSIDE src/pages. ──
      // Inside pages/ this is the "empty state fills the visible area"
      // pattern — legitimate. Outside pages/ it is the flash pattern.
      if (inPages) continue;
      BARE_VIEWPORT_MIN_H.lastIndex = 0;
      let bareMatch: RegExpExecArray | null;
      while ((bareMatch = BARE_VIEWPORT_MIN_H.exec(line)) !== null) {
        hits.push({
          file: rel,
          line: i + 1,
          snippet: line.trim().slice(0, 120),
          kind: "B",
        });
      }
    }
  }
  return hits;
}

describe("viewport-arithmetic lock (#15)", () => {
  it("no viewport arithmetic (Ban A) or bare-viewport minHeight (Ban B) in scanned scope", () => {
    const hits = scan();
    if (hits.length > 0) {
      const banA = hits.filter((h) => h.kind === "A");
      const banB = hits.filter((h) => h.kind === "B");
      const parts: string[] = [];
      if (banA.length > 0) {
        parts.push(
          `Ban A (${banA.length}) · height: calc(100vh|100dvh - N) — viewport arithmetic in page or shell roots.\n` +
          `Chrome above <main> (or above a fixed panel) changes and this pattern hard-codes a guess at it. When the guess is wrong the container overflows its parent and produces a second scrollbar or shoves the layout; when someone tries to "fix" the overflow by clipping the parent, the child gets clipped instead of shrunk (on /ai-coach that clipped the composer input, a control that stopped working while looking present).\n` +
          `Correct pattern: flex column parent with the child at flex:1; minHeight:0 (or <VStack grow minHeight0>), or the CSS-native top/bottom pair on fixed panels (position:fixed; top: N; bottom: 0).\n` +
          `Offenders:\n  ${banA.map((h) => `${h.file}:${h.line} — ${h.snippet}`).join("\n  ")}`,
        );
      }
      if (banB.length > 0) {
        parts.push(
          `Ban B (${banB.length}) · bare minHeight|height: "100vh"|"100dvh" in shell / component code.\n` +
          `This is the "cream rectangle" flash pattern — a Suspense fallback or session-loading placeholder that overflows its slot inside a shell that already has a header and tab bar. On phone the tab bar gets shoved for the flash duration; on desktop the main scroll region gets pushed.\n` +
          `Correct pattern: render a shape-matching skeleton sized to the slot via flex:1; minHeight:0. See components/phone/PhoneScreenSkeleton.tsx. If this file is genuinely pre-shell (boot-time error rendering, sign-in page root with no chrome above), add it to EXEMPT_FILES with a reviewer-facing reason.\n` +
          `Offenders:\n  ${banB.map((h) => `${h.file}:${h.line} — ${h.snippet}`).join("\n  ")}`,
        );
      }
      throw new Error(`Lock #15 · viewport-arithmetic ban:\n\n${parts.join("\n\n")}`);
    }
    expect(hits).toEqual([]);
  });
});
