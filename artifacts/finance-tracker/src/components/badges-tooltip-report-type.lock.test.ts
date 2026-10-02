// Lock · the unconvertible-accounts warning, the shared chart tooltip and the
// tester report sheet follow DESIGN.md §10.
//
// UnconvertibleAccountsBadge ("2 accounts without FX — not in total") is a
// sentence under the net-worth figure, so sans.
//
// MonoTooltip: the series name beside each value is a name, so sans; the value
// is a `.pnum` and the label row (an axis value — a month, a day, a year) stays
// mono through the container. /analytics' growth-projection tooltip reuses the
// container style and draws its series names the same way.
//
// The tester report sheet: the Bug / Idea radio, "Send to group", "Figures
// shown / hidden" and the status line are controls and sentences, so the
// shared `label` style is sans.
//
// StaleAsOf ("AS OF Sep 5, 14:32") is a timestamp and SyncBadge is a count:
// both are data and stay mono.
//
// There is no DOM test environment in this package, so this reads the source,
// the same way the other *.lock.test.ts files do.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
const badge = read("./UnconvertibleAccountsBadge.tsx");
const tooltip = read("./mono-tooltip.tsx");
const analytics = read("../pages/analytics.tsx");
const report = read("./tester-report.tsx");
const staleAsOf = read("./StaleAsOf.tsx");
const syncBadge = read("./sync-badge.tsx");

// The `style={{ ... }}` block of the element that wraps a piece of copy.
function styleBefore(src: string, copy: string): string {
  const i = src.indexOf(copy);
  if (i < 0) throw new Error(`${copy} not found`);
  return src.slice(src.lastIndexOf("style={{", i), i);
}

// The body of a `const name: React.CSSProperties = { ... };` declaration.
function cssConst(src: string, name: string): string {
  const start = src.indexOf(`const ${name}: React.CSSProperties = {`);
  if (start < 0) throw new Error(`const ${name} not found`);
  return src.slice(start, src.indexOf("};", start));
}

describe("UnconvertibleAccountsBadge type", () => {
  it("the warning sentence is sans", () => {
    const style = styleBefore(badge, "{count} account");
    expect(style).not.toContain("--font-mono");
    expect(style).toContain("--font-sans");
  });
});

describe("MonoTooltip type", () => {
  it("the series name is sans", () => {
    const style = styleBefore(tooltip, "{displayName}</span>");
    expect(style).not.toContain("--font-mono");
    expect(style).toContain("--font-sans");
  });

  it("the value is a .pnum", () => {
    expect(tooltip).toMatch(/<span className="pnum"[^>]*>\{displayVal\}<\/span>/);
  });

  it("the container, and so the axis label, stays mono", () => {
    expect(tooltip).toMatch(/monoTooltipStyle: React\.CSSProperties = \{[^}]*fontFamily: "var\(--font-mono\)"/);
  });

  it("/analytics' growth-projection tooltip draws its series names in sans", () => {
    const style = styleBefore(analytics, "{e.name}</span>");
    expect(style).not.toContain("--font-mono");
    expect(style).toContain("--font-sans");
  });
});

describe("tester report sheet type", () => {
  it("the shared label style is sans", () => {
    const style = cssConst(report, "label");
    expect(style).not.toContain("--font-mono");
    expect(style).toContain("--font-sans");
  });
});

describe("data stays mono", () => {
  it("StaleAsOf's timestamp", () => {
    expect(styleBefore(staleAsOf, "title={ts ?")).toContain('fontFamily: "var(--font-mono)"');
  });

  it("SyncBadge's count", () => {
    expect(styleBefore(syncBadge, "{count}\n")).toContain('fontFamily: "var(--font-mono)"');
  });
});
