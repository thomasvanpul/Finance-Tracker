// Lock: the five-step quality scale in the stat drill modal is theme tokens,
// and every theme defines --ft-orange for its "weak" step.
//
// The scale was five fixed hexes (#3fb950 #22d3ee #e3b341 #f97316 #f85149),
// so it ignored the theme. Amber alone could not be swapped, because themes
// whose --ft-amber is already orange would make "fair" and "weak" match.
// --ft-orange sits at the OKLab midpoint of each theme's amber and red, so it
// stays distinct from both neighbours in every theme.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const SCALE_HEXES = /#(3fb950|22d3ee|e3b341|f97316|f85149)\b/i;

describe("--ft-orange and the quality scale", () => {
  it("every theme block that sets --ft-amber also sets --ft-orange", () => {
    const css = readFileSync(join(SRC_DIR, "index.css"), "utf8");
    const blocks = css.split("}").filter((b) => /--ft-amber\s*:/.test(b));
    expect(blocks.length).toBe(14);
    const missing = blocks
      .filter((b) => !/--ft-orange\s*:\s*#[0-9a-f]{6}\s*;/i.test(b))
      .map((b) => b.slice(b.lastIndexOf("\n", b.indexOf("{")) + 1, b.indexOf("{")).trim());
    expect(missing).toEqual([]);
  });

  it("stat-drill-modal.tsx carries none of the scale's fixed hexes", () => {
    const file = "components/investments/stat-drill-modal.tsx";
    const src = readFileSync(join(SRC_DIR, file), "utf8");
    const hits = src.split("\n").flatMap((line, i) =>
      SCALE_HEXES.test(line) ? [`${file}:${i + 1}`] : [],
    );
    expect(hits).toEqual([]);
  });

  it("stat-drill-modal.tsx never appends hex alpha to a scale colour", () => {
    const src = readFileSync(join(SRC_DIR, "components/investments/stat-drill-modal.tsx"), "utf8");
    expect(src).not.toMatch(/QC\[[^\]]+\]\s*\+\s*"/);
    expect(src).not.toMatch(/\$\{QC\[[^\]]+\]\}[0-9a-f]{2}/i);
  });
});
