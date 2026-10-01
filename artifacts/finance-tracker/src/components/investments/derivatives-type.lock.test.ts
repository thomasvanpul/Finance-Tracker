// Lock · the Derivatives tab follows DESIGN.md §10.
//
// The explainer toggles ("What is an option?"), the Greek row names, the
// chain's loading line and empty-state prompt, the chain caption and the
// detected strategy name are language, so sans. The panel headers, the payoff
// legends, tickers, expiry dates, every strike, premium, contract count and
// P&L cell, and the Greek values are data, so mono, and stay. The chain
// caption's expiry date and strike count keep their .pnum spans.
//
// There is no DOM test environment in this package, so this reads the source,
// the same way the other *.lock.test.ts files do.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(path.resolve(__dirname, "./derivatives-tab.tsx"), "utf8");

// Where a piece of copy is drawn: the first line that starts with it, so an
// attribute (`key={g.label}`) or a comment naming it does not match.
function drawnAt(copy: string): number {
  const escaped = copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = new RegExp(`\\n[ \\t]*${escaped}`).exec(src);
  if (!m) throw new Error(`${copy} not found`);
  return m.index + m[0].length - copy.length;
}

// The style block that draws a piece of copy: from the nearest `style={{`
// before it up to the copy itself.
function styleBefore(copy: string): string {
  const at = drawnAt(copy);
  return src.slice(src.lastIndexOf("style={{", at), at);
}

describe("Derivatives type: language is sans", () => {
  it.each([
    "{g.label}",
    '{open ? "▼" : "►"} {title}',
    "Loading {activeTicker} options chain...",
    "Enter a ticker symbol above to load a live options chain.",
    "— {strategyName}",
  ])("draws %s in sans", (copy) => {
    const block = styleBefore(copy);
    expect(block).toContain("--font-sans");
    expect(block).not.toContain("--font-mono");
  });

  it("draws the chain caption in sans, its date and count as .pnum", () => {
    const at = drawnAt("Expiry: ");
    const open = src.lastIndexOf("<span", src.lastIndexOf("style={{", at));
    const caption = src.slice(open, src.indexOf("</span>\n", at));
    expect(caption).toContain("--font-sans");
    expect(caption).not.toContain("--font-mono");
    expect(caption.match(/className="pnum"/g)?.length).toBe(2);
  });
});

describe("Derivatives type: data stays mono", () => {
  it.each([
    "{g.format(val)}",
    "{chain.ticker}",
    "AT-EXPIRY PAYOFF · BREAKEVEN",
    "COMBINED PAYOFF AT EXPIRY",
    "Black-Scholes Calculator",
    "Options Positions",
    "Futures Positions",
    "Live Options Chain",
    "Strategy Builder",
  ])("keeps %s mono", (copy) => {
    expect(styleBefore(copy)).toContain("--font-mono");
  });

  // Inline cells: <td style={{ ... }}>{pos.ticker}</td>, so not line-start.
  it.each(["{pos.ticker}</td>", "{pos.symbol}</td>"])("keeps the %s cell mono", (cell) => {
    const at = src.indexOf(cell);
    expect(at).toBeGreaterThan(0);
    expect(src.slice(src.lastIndexOf("style={{", at), at)).toContain("--font-mono");
  });

  it("keeps the expiry pills mono", () => {
    expect(styleBefore("{exp}")).toContain("--font-mono");
  });
});
