// DESIGN.md §8 / CLAUDE.md: a figure is shown in full or not at all.
// InsightSlot's headline and body are producer strings that carry figures
// ("£1,284.50 more than last month", "£31 outstanding for 74 days."), so the
// line holding them must wrap rather than ellipsise. A one-line ellipsis crops
// a long figure mid-number, which reads as a different, plausible amount.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InsightSlot } from "./InsightSlot";
import type { Insight } from "@/lib/spending-insights";

const insight: Insight = {
  id: "t",
  source: "test",
  priority: 1,
  headline: "Groceries ran £1,284.50 over last month",
  body: "You spent £3,912.07 on groceries against a usual £2,627.57 across the last six months.",
};

// The opening tag of the nearest element that directly contains `text`'s first figure.
function lineHolding(html: string, figure: string): string {
  const at = html.indexOf(`>${figure}<`);
  expect(at).toBeGreaterThan(-1);
  const div = html.lastIndexOf("<div", at);
  return html.slice(div, html.indexOf(">", div) + 1);
}

describe("InsightSlot figure lines", () => {
  const html = renderToStaticMarkup(<InsightSlot insight={insight} onDismiss={() => {}} />);

  for (const [name, figure] of [["headline", "£1,284.50"], ["body", "£3,912.07"]] as const) {
    it(`never crops the ${name}, which carries a figure`, () => {
      const tag = lineHolding(html, figure);
      expect(tag).not.toContain("text-overflow:ellipsis");
      expect(tag).not.toContain("overflow:hidden");
      expect(tag).not.toContain("white-space:nowrap");
    });
  }
});
