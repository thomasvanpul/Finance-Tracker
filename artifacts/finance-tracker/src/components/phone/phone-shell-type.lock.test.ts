// Lock · the phone shell's chrome follows DESIGN.md §10.
//
// The header every directory route opens in (16 wrapped routes and 8
// desktop-only ones), the DIRECTORY tab's own header, the desktop-only
// explainer and the not-wired fallback. The back control, the screen title,
// the "DESKTOP FOR NOW" eyebrow and the fallback sentence are language, so
// sans. The directory row's item count is a number, so it stays mono.
//
// There is no DOM test environment in this package, so this reads the source,
// the same way the other *.lock.test.ts files do.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
const shell = read("./PhoneShell.tsx");
const directory = read("./DirectoryScreen.tsx");
const desktopOnly = read("./DesktopOnlyScreen.tsx");

function bodyOf(src: string, fnName: string): string {
  const start = src.search(new RegExp(`function ${fnName}\\(`));
  if (start < 0) throw new Error(`${fnName} not found`);
  const next = src.indexOf("\nfunction ", start + 1);
  const nextExport = src.indexOf("\nexport function ", start + 1);
  const ends = [next, nextExport].filter((i) => i > 0);
  return src.slice(start, ends.length ? Math.min(...ends) : undefined);
}

function slice(src: string, from: string, to: string): string {
  const start = src.indexOf(from);
  if (start < 0) throw new Error(`${from} not found`);
  const end = src.indexOf(to, start);
  if (end < 0) throw new Error(`${to} not found`);
  return src.slice(start, end);
}

describe("phone shell chrome type", () => {
  it("draws the directory-route header's back control and title in sans", () => {
    expect(bodyOf(shell, "DirectoryItemScreen")).not.toContain("--font-mono");
  });

  it("draws the not-wired fallback sentence in sans", () => {
    expect(slice(shell, "const placeholderStyle", "};")).not.toContain("--font-mono");
  });

  it("draws the desktop-only explainer's back control, title and eyebrow in sans", () => {
    expect(bodyOf(desktopOnly, "DesktopOnlyScreen")).not.toContain("--font-mono");
  });

  it("draws the DIRECTORY header's back control and group title in sans", () => {
    const header = slice(bodyOf(directory, "DirectoryScreen"), "<header", "</header>");
    expect(header).not.toContain("--font-mono");
  });

  it("keeps the directory row's item count in mono", () => {
    expect(directory).toMatch(
      /fontFamily: "var\(--font-mono\)",[\s\S]{0,200}<span className="pnum">\{group\.items\.length\}<\/span>/,
    );
  });
});
