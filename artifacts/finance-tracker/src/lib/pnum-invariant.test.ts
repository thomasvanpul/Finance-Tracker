// Source-level lock on the "no truncation on financial figures" rule.
//
// CLAUDE.md: "A financial figure is shown in full or not at all. A
// truncated figure that reads as a different, plausible number is the
// worst class of defect a finance app can ship: £11,371 clipped to
// £1… reads as £1."
//
// Unlike a broken layout, a truncated figure produces a plausible
// wrong number. Same category as the credential-never-leaves-the-
// server test in artifacts/api-server/src/routes/connections.test.ts:
// assert on the thing that would actually break, not on the intention.
//
// Rule: any JSX element whose attribute set includes the `pnum` class
// MUST NOT also carry `overflow: "hidden"` or `textOverflow: …` on
// the same element. Same rule applied to any CSS selector containing
// `.pnum` in index.css.
//
// This test walks the source tree. It doesn't render anything. A new
// violation anywhere fails CI rather than waiting for a port to
// surface it visually.
//
// Escapes if you genuinely need them:
//   - Wrap the figure in its own element (a parent can be overflow:
//     hidden; the .pnum span does not carry it).
//   - Use font-size clamp() so the figure shrinks instead of clipping.
//   - Use pre-computed abbreviations (£1.2k) rather than truncation.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const SRC_DIR = join(dirname(__filename), "..");
const REPO_ROOT = join(SRC_DIR, "..");

// Walk src, skipping generated + test files so the lock covers source
// code we author, not asserts on itself. Symlink-safe via statSync.
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    // Skip anything nested named node_modules or dist just in case.
    if (entry === "node_modules" || entry === "dist" || entry === "generated") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full));
    } else if (st.isFile()) {
      out.push(full);
    }
  }
  return out;
}

const files = walk(SRC_DIR).filter((f) =>
  (f.endsWith(".tsx") || f.endsWith(".ts")) &&
  !f.endsWith(".test.ts") &&
  !f.endsWith(".test.tsx") &&
  // This file itself contains the forbidden patterns as string literals
  // for the regex — skip it.
  !f.endsWith("pnum-invariant.test.ts"),
);

// A JSX opening tag can span multiple lines. Match `<X …>` non-greedily,
// including the leading `<` and the terminal `>`. Attribute strings can
// contain `>` inside `{}` blocks, so we match brace-balanced.
//
// Simple approach: scan character by character. When we see `<` followed
// by an ASCII letter, start capturing until the balanced `>` (tracking
// depth of `{`, `(`, `[`, and single- / double- / backtick-quoted
// strings). Return each opening tag as one string.
function openingTags(source: string): { line: number; text: string }[] {
  const tags: { line: number; text: string }[] = [];
  const n = source.length;
  let i = 0;
  let line = 1;
  while (i < n) {
    const ch = source[i]!;
    if (ch === "\n") { line += 1; i += 1; continue; }
    if (ch !== "<") { i += 1; continue; }
    // Must be followed by an ASCII letter to count as a JSX opening.
    // Not a closing tag (`</`) and not a comment (`<!--`).
    const next = source[i + 1] ?? "";
    if (!/[A-Za-z]/.test(next)) { i += 1; continue; }
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
        i = j + 1;
        break;
      }
      j += 1;
    }
    if (j >= n) i = n; // unterminated (unlikely) — stop
  }
  return tags;
}

interface Violation {
  file: string;
  line: number;
  reason: "textOverflow" | "overflow-hidden";
  snippet: string;
}

function scanJsx(file: string, source: string): Violation[] {
  const out: Violation[] = [];
  for (const tag of openingTags(source)) {
    // Must mention pnum via className. Match either bare
    // `className="pnum"` / `className="… pnum …"` or `className={…"pnum"…}`.
    // A regex on the tag text is enough — the tag text is the entire
    // opening tag as one string.
    const t = tag.text;
    const hasPnum = /className\s*=\s*(?:"[^"]*\bpnum\b[^"]*"|\{[^}]*["'`]pnum["'`][^}]*\}|\{[^}]*\bpnum\b[^}]*\})/.test(t);
    if (!hasPnum) continue;
    // textOverflow always clips digits. Any assignment fails.
    if (/\btextOverflow\s*:/.test(t)) {
      out.push({ file, line: tag.line, reason: "textOverflow", snippet: t.replace(/\s+/g, " ").slice(0, 240) });
    }
    // overflow: "hidden" on the same element clips digits when a
    // narrower parent squeezes. overflow: "auto" / "scroll" are fine
    // (produce scroll, not silent clip) and are not matched here.
    if (/\boverflow\s*:\s*["']hidden["']/.test(t)) {
      out.push({ file, line: tag.line, reason: "overflow-hidden", snippet: t.replace(/\s+/g, " ").slice(0, 240) });
    }
  }
  return out;
}

function scanCss(file: string, source: string): Violation[] {
  const out: Violation[] = [];
  // Find every rule block. Selector list ends at `{`; block ends at
  // matching `}`. Nested blocks in CSS-in-CSS are unusual; we ignore.
  const re = /([^{}]*)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const selector = m[1]!;
    const block = m[2]!;
    // Any selector containing .pnum is in scope. Includes `.pnum`,
    // `.pnum:hover`, `.parent .pnum`, `.a.pnum`, etc.
    if (!/\.pnum\b/.test(selector)) continue;
    const line = source.slice(0, m.index).split("\n").length;
    if (/\btext-overflow\s*:/.test(block)) {
      out.push({ file, line, reason: "textOverflow", snippet: `${selector.trim()} { … text-overflow: … }` });
    }
    if (/\boverflow\s*:\s*hidden\b/.test(block)) {
      out.push({ file, line, reason: "overflow-hidden", snippet: `${selector.trim()} { … overflow: hidden … }` });
    }
  }
  return out;
}

describe("pnum invariant — no truncation on financial figures", () => {
  it("no JSX element with className='pnum' also carries textOverflow or overflow:'hidden'", () => {
    const all: Violation[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf-8");
      all.push(...scanJsx(file, src));
    }
    if (all.length > 0) {
      const report = all
        .map((v) => `  ${relative(REPO_ROOT, v.file)}:${v.line}  [${v.reason}]  ${v.snippet}`)
        .join("\n");
      throw new Error(
        `Found ${all.length} pnum element(s) carrying a truncation rule.\n` +
        `CLAUDE.md: "A financial figure is shown in full or not at all."\n` +
        `Move the overflow rule to a parent, use clamp() on font-size, or ` +
        `pre-abbreviate the figure. See lib/pnum-invariant.test.ts for options.\n\n` +
        `Violations:\n${report}`,
      );
    }
    expect(all).toEqual([]);
  });

  it("no .pnum CSS rule in index.css declares text-overflow or overflow: hidden", () => {
    const cssPath = join(SRC_DIR, "index.css");
    const src = readFileSync(cssPath, "utf-8");
    const violations = scanCss(cssPath, src);
    if (violations.length > 0) {
      const report = violations
        .map((v) => `  ${relative(REPO_ROOT, v.file)}:${v.line}  [${v.reason}]  ${v.snippet}`)
        .join("\n");
      throw new Error(
        `Found ${violations.length} .pnum CSS rule(s) that clip financial figures.\n${report}`,
      );
    }
    expect(violations).toEqual([]);
  });
});
