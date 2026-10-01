// Lock · UPCOMING and the WORTH composition chart follow DESIGN.md §10.
//
// Tab labels, empty-state copy and names a human wrote are language, so sans.
// Figures, the legend over a figure, month ticks, currency codes and the
// days-left count are data, so mono, and they are left alone here.
//
// There is no DOM test environment in this package, so this reads the source,
// the same way the other *.lock.test.ts files do.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
const upcoming = read("./UpcomingScreen.tsx");
const composition = read("./CompositionChart.tsx");

function bodyOf(src: string, fnName: string): string {
  const start = src.search(new RegExp(`function ${fnName}\\(`));
  if (start < 0) throw new Error(`${fnName} not found`);
  const next = src.indexOf("\nfunction ", start + 1);
  const nextExport = src.indexOf("\nexport function ", start + 1);
  const ends = [next, nextExport].filter((i) => i > 0);
  return src.slice(start, ends.length ? Math.min(...ends) : undefined);
}

// The style block that draws a piece of literal copy: from the nearest
// `style={{` before it up to the copy itself.
function styleBefore(src: string, copy: string): string {
  const at = src.indexOf(copy);
  if (at < 0) throw new Error(`${copy} not found`);
  return src.slice(src.lastIndexOf("style={{", at), at);
}

describe("UPCOMING type", () => {
  it("draws the lens tabs in sans", () => {
    expect(bodyOf(upcoming, "LensStrip")).not.toContain("--font-mono");
  });

  it("draws the countdown chip's name in sans and its days-left count in mono", () => {
    const strip = bodyOf(upcoming, "CountdownStrip");
    expect(strip).not.toMatch(/fontFamily: "var\(--font-mono\)",\s*fontSize: 10/);
    expect(strip).toMatch(/fontFamily: "var\(--font-mono\)" \}\}>\{daysLabel\(days\)\}/);
  });
});

describe("WORTH composition chart type", () => {
  it("draws the view tabs in sans", () => {
    expect(bodyOf(composition, "ViewTab")).not.toContain("--font-mono");
  });

  it.each(["NO POSITIONS", "NO HISTORY"])("draws the %s empty state in sans", (copy) => {
    expect(styleBefore(composition, copy)).not.toContain("--font-mono");
  });

  it("keeps the HOLDINGS legend and the total in mono", () => {
    expect(composition).toMatch(/fontFamily="var\(--font-mono\)"[^>]*>HOLDINGS</);
    expect(composition).toMatch(/fontFamily="var\(--font-mono\)"[^>]*>\{symbol\}\{totalLabel\}</);
  });
});
