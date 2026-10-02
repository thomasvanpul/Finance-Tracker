// Lock · the PWA install prompt and the phone StatGrid follow DESIGN.md §10.
//
// The install prompt's INSTALL and × are button labels, so sans.
//
// StatGrid's figure is data and stays mono. Its label is usually a legend over
// that figure ("NET WORTH"), which §10 keeps mono; but its one live caller,
// SPENDING's CategoryStrip, puts a category name there, and a category is a
// name a human wrote, so sans. The family is a prop, `labelMono`, mono by
// default, and CategoryStrip turns it off — the same split PhoneEntityRow's
// `secondaryMono` already makes for SPENDING's category.
//
// There is no DOM test environment in this package, so this reads the source,
// the same way the other *.lock.test.ts files do.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
const pwa = read("./pwa-install.tsx");
const statGrid = read("./phone/StatGrid.tsx");
const categoryStrip = read("./phone/CategoryStrip.tsx");

// The `style={{ ... }}` block of the element that wraps a piece of copy.
function styleBefore(src: string, copy: string): string {
  const i = src.indexOf(copy);
  if (i < 0) throw new Error(`${copy} not found`);
  return src.slice(src.lastIndexOf("style={{", i), i);
}

describe("PWA install prompt type", () => {
  it("INSTALL is sans", () => {
    const style = styleBefore(pwa, "INSTALL\n");
    expect(style).not.toContain("--font-mono");
    expect(style).toContain("--font-sans");
  });

  it("the dismiss × is sans", () => {
    const style = styleBefore(pwa, "×\n");
    expect(style).not.toContain("--font-mono");
    expect(style).toContain("--font-sans");
  });
});

describe("StatGrid type", () => {
  it("the label takes its family from the labelMono prop", () => {
    expect(styleBefore(statGrid, "{label}\n")).toContain(
      'fontFamily: labelMono ? "var(--font-mono)" : "var(--font-sans)"',
    );
  });

  it("labelMono is on unless the caller turns it off", () => {
    expect(statGrid).toMatch(/labelMono = true/);
  });

  it("the figure stays mono", () => {
    expect(styleBefore(statGrid, "{href ? <span")).toContain('fontFamily: "var(--font-mono)"');
  });

  it("CategoryStrip's category names are sans", () => {
    expect(categoryStrip).toMatch(/labelMono=\{false\}/);
  });
});
