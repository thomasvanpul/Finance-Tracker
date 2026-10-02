// Lock · the shared empty / error / couldn't-load states, the phone sheet title
// and the dashboard's EDIT LAYOUT control follow DESIGN.md §10.
//
// EmptyState, ErrorState and LazyRouteBoundary: the uppercase line ("— NO
// DATA —", "— ERROR —", "COULDN'T LOAD") sits over a sentence, not a figure,
// so it is sans — the same call 3921616 made for the phone's MobileEmptyState
// and PhoneSectionError, and 6065ea8 for "DESKTOP FOR NOW". The description
// and the error message are sentences, so sans.
//
// MobileSheet's DrawerTitle is a dialog title, so sans — the desktop branch's
// DialogTitle already takes the body family.
//
// EditLayout ("Edit layout" / "Done") is a button label, so sans.
//
// Data stays mono: the KPI bar's persona code ("MKT·01") is a code, FixingTag
// ("ECB 5 Sep") is a dated provenance mark, and the TOTP field is read digit by
// digit.
//
// There is no DOM test environment in this package, so this reads the source,
// the same way the other *.lock.test.ts files do.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
const emptyState = read("./empty-state.tsx");
const errorState = read("./error-state.tsx");
const lazyBoundary = read("./lazy-route-boundary.tsx");
const mobileSheet = read("./mobile-sheet.tsx");
const topRegion = read("./dashboard/top-region.tsx");
const kpiBar = read("./kpi-bar.tsx");
const fixingMark = read("./FixingMark.tsx");
const authGate = read("./auth-gate.tsx");

// The `style={{ ... }}` block of the element that wraps a piece of copy.
function styleBefore(src: string, copy: string): string {
  const i = src.indexOf(copy);
  if (i < 0) throw new Error(`${copy} not found`);
  return src.slice(src.lastIndexOf("style={{", i), i);
}

describe("shared states type", () => {
  it("EmptyState's title is sans", () => {
    const style = styleBefore(emptyState, "— {title} —");
    expect(style).not.toContain("--font-mono");
    expect(style).toContain("--font-sans");
  });

  it("EmptyState has no mono left", () => {
    expect(emptyState).not.toContain("--font-mono");
  });

  it("ErrorState's container is sans, so the eyebrow and the message are", () => {
    expect(errorState).not.toContain("--font-mono");
    expect(styleBefore(errorState, "<div\n        style={{\n          fontSize: 11")).toContain("--font-sans");
  });

  it("LazyRouteBoundary's COULDN'T LOAD is sans", () => {
    const style = styleBefore(lazyBoundary, "COULDN'T LOAD");
    expect(style).not.toContain("--font-mono");
    expect(style).toContain("--font-sans");
  });

  it("MobileSheet's drawer title is sans", () => {
    const style = styleBefore(mobileSheet, "{title}\n            </DrawerTitle>");
    expect(style).not.toContain("--font-mono");
    expect(style).toContain("--font-sans");
  });

  it("EditLayout's label is sans", () => {
    const start = topRegion.indexOf("export function EditLayout");
    const shared = topRegion.slice(start, topRegion.indexOf("};", start));
    expect(shared).not.toContain("--font-mono");
    expect(shared).toContain("--font-sans");
  });
});

describe("data stays mono", () => {
  it("the KPI bar's persona code", () => {
    expect(styleBefore(kpiBar, "title={`${persona.label}")).toContain('fontFamily: "var(--font-mono)"');
  });

  it("FixingTag's dated mark", () => {
    expect(styleBefore(fixingMark, "{when ? `ECB ${when}`")).toContain('fontFamily: "var(--font-mono)"');
  });

  it("the TOTP code field", () => {
    expect(authGate).toMatch(/placeholder="000000"[\s\S]{0,200}fontFamily: "var\(--font-mono\)"/);
  });
});
