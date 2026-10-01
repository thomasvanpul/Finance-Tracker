// Source-level lock: no `rgba(244,162,30,…)` anywhere in the app.
//
// DESIGN.md §11 and index.css: that literal is a previous accent that matches
// --ft-accent on none of the themes, so a selected chip or a warning banner
// painted with it stayed gold on arctic, crimson and the rest. Pressable,
// selected and current speak --ft-accent (--ft-accent-tint / --ft-accent-edge);
// warning speaks --ft-amber, mixed with color-mix where it needs a wash.
//
// persona-quick-start.lock.test.ts locked one file; this locks the tree.
// CSS comments are stripped first: index.css names the literal in the comment
// that explains the tokens replacing it, which is documentation, not paint.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const DEAD_ACCENT = /rgba\(\s*244\s*,\s*162\s*,\s*30\b/g;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === "generated") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk(SRC_DIR).filter(
  (f) => /\.(tsx?|css)$/.test(f) && !/\.test\.tsx?$/.test(f),
);

describe("dead accent lock", () => {
  it("no source file paints rgba(244,162,30,…)", () => {
    const hits: string[] = [];
    for (const f of files) {
      let text = readFileSync(f, "utf8");
      if (f.endsWith(".css")) text = text.replace(/\/\*[\s\S]*?\*\//g, "");
      const n = text.match(DEAD_ACCENT)?.length ?? 0;
      if (n > 0) hits.push(`${relative(SRC_DIR, f)} (${n})`);
    }
    expect(hits).toEqual([]);
  });
});
