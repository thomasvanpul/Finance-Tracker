// Mark-radius lock.
//
// Small marks — 2-6px bars, 6-8px legend swatches, sparkline columns —
// carried borderRadius 2 at 262 sites and borderRadius 1 at 34, on the
// same kind of element (a 3px bar in month-comparison.tsx at 2, a 3px bar
// in accounts.tsx at 1). One pixel apart is drift, not variation (finding
// 3cd0ad806cd7, 2026-10-01). 2px won: it is the majority and it is what
// `--radius: 0.125rem` in index.css already says.
//
// What this locks: no source file under src/ sets a 1px border radius,
// as an inline-style number, a "1px" string, or a CSS declaration.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");
const ONE_PX = /borderRadius:\s*(1|"1px"|'1px')\s*[,}\s]|border-radius:\s*1px\b/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|css)$/.test(name) && !name.includes(".test.") ? [path] : [];
  });
}

describe("mark radius", () => {
  it("no 1px border radius anywhere in src", () => {
    const hits = sourceFiles(SRC).flatMap((path) =>
      readFileSync(path, "utf8").split("\n").flatMap((line, i) =>
        line.match(ONE_PX) ? [`${relative(SRC, path)}:${i + 1}`] : []));
    expect(hits).toEqual([]);
  });
});
