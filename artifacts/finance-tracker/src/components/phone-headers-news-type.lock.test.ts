// Lock · the phone SectionHeader, HOME's cash-flow legend and HOME's news meta
// line follow DESIGN.md §10.
//
// SectionHeader is the titlebar on every phone tab. §2 sets a section title in
// Plex Sans, and the Mobile Amendment prefers sans for labels on the phone, so
// the title is sans — including SPENDING's date titles ("TUE 26 AUG"), so that
// one list of headers is not split across two families. The figures in its
// right slot set mono themselves and are unaffected.
//
// HOME's cash-flow chart: SO FAR and PROJECTED name the chart's two marks, so
// sans; "LOW SO FAR £x · 12 Oct" is a legend beside its figure and stays mono,
// as does the date axis.
//
// HOME's news rows: the publisher is a name, so sans; the YOUR AAPL / YOUR USD
// tag (a ticker or currency code) and the age ("3h") are data and stay mono.
//
// There is no DOM test environment in this package, so this reads the source,
// the same way the other *.lock.test.ts files do.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(path.resolve(__dirname, rel), "utf8");
const sectionHeader = read("./phone/SectionHeader.tsx");
const home = read("./mobile/MobileHome.tsx");
const news = read("./mobile/NewsPane.tsx");

// The `style={{ ... }}` block of the element that wraps a piece of copy.
function styleBefore(src: string, copy: string): string {
  const i = src.indexOf(copy);
  if (i < 0) throw new Error(`${copy} not found`);
  return src.slice(src.lastIndexOf("style={{", i), i);
}

describe("phone SectionHeader type", () => {
  it("the title is sans", () => {
    const style = styleBefore(sectionHeader, "{icon}");
    expect(style).not.toContain("--font-mono");
    expect(style).toContain("--font-sans");
  });
});

describe("HOME cash-flow legend type", () => {
  it("SO FAR and PROJECTED are sans", () => {
    // The legend row's container; the swatches inside it carry their own styles.
    const style = styleBefore(home, '<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>');
    expect(style).not.toContain("--font-mono");
    expect(style).toContain("--font-sans");
  });

  it("LOW SO FAR and its figure stay mono", () => {
    expect(styleBefore(home, "LOW SO FAR {nfmt")).toContain('fontFamily: "var(--font-mono)"');
  });

  it("the date axis stays mono", () => {
    expect(styleBefore(home, "{hasToday && tick(todayIndex)}")).toContain('fontFamily: "var(--font-mono)"');
  });
});

describe("HOME news meta type", () => {
  it("the publisher is sans", () => {
    // The meta row's container; the tag and the age set their own family.
    const style = styleBefore(news, "{/* A tag that reads");
    expect(style).not.toContain("--font-mono");
    expect(style).toContain("--font-sans");
  });

  it("the ticker or currency tag stays mono", () => {
    expect(styleBefore(news, "{it.connectedTo.label}")).toContain('fontFamily: "var(--font-mono)"');
  });

  it("the age stays mono", () => {
    expect(styleBefore(news, "{formatWhen(it.publishedAt)}")).toContain('fontFamily: "var(--font-mono)"');
  });
});
