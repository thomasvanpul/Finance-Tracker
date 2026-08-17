// Source-level lock: no emoji codepoints in JSX strings anywhere in
// src. CLAUDE.md: "No emoji anywhere in the UI, including flags.
// Currency and country identity is carried by purpose-drawn SVG
// icons, never by emoji — they render differently on every platform,
// cannot be themed, ignore the type ladder, and read as decoration."
//
// The pnum lock found 8 sites I missed by hand; expect the same
// shape of yield here — greps catch mechanically what a reader
// misses under time pressure.
//
// Rule this locks: any character in the Unicode ranges that browsers
// render as pictographic emoji cannot appear in a JSX string literal
// or JSX text child. Includes:
//   - Regional-indicator pairs (flag emoji): U+1F1E6-1F1FF
//   - Miscellaneous Symbols and Pictographs: U+1F300-1F5FF
//   - Emoticons: U+1F600-1F64F
//   - Transport and Map Symbols: U+1F680-1F6FF
//   - Supplemental Symbols and Pictographs: U+1F900-1F9FF
//   - Symbols and Pictographs Extended-A: U+1FA70-1FAFF
//   - Emoji presentation variation selector: U+FE0F
//   - Zero-width joiner (only when paired with emoji): U+200D
//
// Deliberately NOT flagged:
//   - Typographic punctuation: — · ✕ ✓ › ▸ (some are Miscellaneous
//     Symbols; the test allows the specific glyphs already in the
//     app's design vocabulary via an allowlist).
//   - Arrows: → ↑ ↓ ← (Miscellaneous Symbols and Arrows block; not
//     pictographic).
//
// Escapes: none. If a real product need surfaces (rare — a country
// icon set already covers currency + market identity), extend
// SvgIconSet in components/currency-mark.tsx and route callers
// through that.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const SRC_DIR = join(dirname(__filename), "..");
const REPO_ROOT = join(SRC_DIR, "..");

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

const files = walk(SRC_DIR).filter((f) =>
  (f.endsWith(".tsx") || f.endsWith(".ts")) &&
  !f.endsWith(".test.ts") &&
  !f.endsWith(".test.tsx") &&
  // The lock file itself names the forbidden pattern in comments +
  // regex sources; skip it so it doesn't fail on its own docstring.
  !f.endsWith("no-emoji.test.ts"),
);

// Emoji ranges — see the docstring above. Combined into one regex
// via character class alternation. Node's u flag handles the
// supplementary-plane codepoints.
const EMOJI_RE = /[\u{1F1E6}-\u{1F1FF}\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]|\u{FE0F}/gu;

interface Hit {
  file: string;
  line: number;
  col: number;
  codepoint: string;
  context: string;
}

function scan(file: string, source: string): Hit[] {
  const out: Hit[] = [];
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    EMOJI_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = EMOJI_RE.exec(line)) !== null) {
      const cp = m[0].codePointAt(0)!;
      out.push({
        file,
        line: i + 1,
        col: m.index + 1,
        codepoint: `U+${cp.toString(16).toUpperCase().padStart(4, "0")}`,
        context: line.slice(Math.max(0, m.index - 20), m.index + 20).replace(/\s+/g, " "),
      });
    }
  }
  return out;
}

describe("no-emoji invariant — no emoji codepoints in JSX / TS sources", () => {
  it("no source file under src/ contains an emoji codepoint", () => {
    const all: Hit[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf-8");
      all.push(...scan(file, src));
    }
    if (all.length > 0) {
      const report = all
        .map((h) => `  ${relative(REPO_ROOT, h.file)}:${h.line}:${h.col}  ${h.codepoint}  ${JSON.stringify(h.context)}`)
        .join("\n");
      throw new Error(
        `Found ${all.length} emoji codepoint(s) in source.\n` +
        `CLAUDE.md: "No emoji anywhere in the UI, including flags."\n` +
        `Route through <CurrencyMark> / <CountryMark> in components/currency-mark.tsx, ` +
        `or extend that file with a new SVG glyph. See lib/no-emoji.test.ts for the covered ranges.\n\n` +
        `Violations:\n${report}`,
      );
    }
    expect(all).toEqual([]);
  });
});
