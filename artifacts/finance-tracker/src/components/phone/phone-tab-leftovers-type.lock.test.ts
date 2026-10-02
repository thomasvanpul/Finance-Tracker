// Lock · the last language sites on the phone tabs follow DESIGN.md §10.
//
// The swipe-to-delete button's DELETE is a button label, and the transaction
// sheet's DELETE already went sans (bb44717): one action, one family. The
// filter chips' × is a dismiss mark inside a sans button label, like the PWA
// prompt's × (pwa-statgrid-type.lock.test.ts). WORTH's COMPOSITION is a section
// title over tab controls, not a legend over a figure, and every phone
// SectionHeader is already sans (89fd2b9).
//
// Left in mono, and asserted here so a later pass does not take them: the
// figures, the NET WORTH legend over the hero, the BY CURRENCY rows, and the
// ITEMS / ROWS counts.
//
// There is no DOM test environment in this package, so this reads the source,
// the same way the other *.lock.test.ts files do.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
const css = read("../../index.css");
const upcoming = read("./UpcomingScreen.tsx");
const spending = read("./SpendingScreen.tsx");
const worth = read("./WorthScreen.tsx");

// The style block that draws a piece of literal copy: from the nearest
// `style={{` before it up to the copy itself.
function styleBefore(src: string, copy: string): string {
  const at = src.indexOf(copy);
  if (at < 0) throw new Error(`${copy} not found`);
  return src.slice(src.lastIndexOf("style={{", at), at);
}

function cssRule(selector: string): string {
  const at = css.indexOf(`${selector} {`);
  if (at < 0) throw new Error(`${selector} not found`);
  return css.slice(at, css.indexOf("}", at));
}

describe("swipe-to-delete", () => {
  it("draws DELETE in sans", () => {
    const rule = cssRule(".ft-swipe-delete-action");
    expect(rule).not.toContain("--font-mono");
    expect(rule).toContain("--font-sans");
  });
});

describe("filter chips", () => {
  it.each([
    ["UPCOMING", upcoming],
    ["SPENDING", spending],
  ])("%s draws the chip's dismiss × in sans", (_name, src) => {
    const marks = src.match(/<span aria-hidden="true" style=\{\{[^}]*\}\}>×<\/span>/g) ?? [];
    expect(marks.length).toBeGreaterThan(0);
    for (const m of marks) {
      expect(m).not.toContain("--font-mono");
      expect(m).toContain("--font-sans");
    }
  });

  it("keeps the ITEMS and ROWS counts in mono", () => {
    expect(styleBefore(upcoming, '<span className="pnum">{filteredItems.length}')).toContain("--font-mono");
    expect(styleBefore(spending, '<span className="pnum">{count}')).toContain("--font-mono");
  });
});

describe("WORTH", () => {
  it("draws the COMPOSITION section title in sans", () => {
    const style = styleBefore(worth, "COMPOSITION\n");
    expect(style).not.toContain("--font-mono");
    expect(style).toContain("--font-sans");
  });

  it("keeps the NET WORTH legend over the hero in mono", () => {
    expect(styleBefore(worth, "NET WORTH\n")).toContain("--font-mono");
  });
});
