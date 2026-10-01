import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";
import { HomeSectionHeader } from "./home-section-header";

// DESIGN.md §14: a way into somewhere is a real anchor, not <a onClick> with
// no href — keyboard reachable, middle-clickable, shown in the status bar.
// Finding 48d3acba9c44: HOME's links were <a onClick> with no href.

describe("HOME links are real anchors", () => {
  it("HomeSectionHeader renders its link with an href", () => {
    const html = renderToStaticMarkup(
      <Router ssrPath="/">
        <HomeSectionHeader label="MARCH · LIQUID" link="CASHFLOW ›" href="/cashflow" />
      </Router>,
    );
    expect(html).toMatch(/<a [^>]*href="\/cashflow"[^>]*>CASHFLOW ›<\/a>/);
  });

  it("no <a> element in components/mobile is missing an href", () => {
    const dir = __dirname;
    const offenders: string[] = [];
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".tsx") || file.endsWith(".test.tsx")) continue;
      const src = readFileSync(path.join(dir, file), "utf8");
      // Each <a ...>...</a> span. An attribute can hold `=>`, so the opening
      // tag cannot be cut at its first `>`; the whole span is checked instead.
      for (const m of src.matchAll(/<a[\s>][\s\S]*?<\/a>/g)) {
        if (!/\bhref=/.test(m[0])) offenders.push(`${file}: ${m[0].slice(0, 60)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
