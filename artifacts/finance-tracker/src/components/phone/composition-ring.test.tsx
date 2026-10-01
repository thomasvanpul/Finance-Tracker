// DESIGN.md §7: the composition ring's total is a currency figure in the
// user's base currency, not a hardcoded "£", and its legend percentages are
// figures, so they carry .pnum (privacy mode, tabular digits, no cropping).
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RingView, type Holdings } from "./CompositionChart";

const holdings: Holdings = { cash: 6000, investment: 4000, pension: 0, property: 0, other: 0 };

describe("RingView", () => {
  it("labels the total in the base currency it is given", () => {
    const html = renderToStaticMarkup(<RingView holdings={holdings} baseCurrency="USD" />);
    expect(html).toContain("$10,000");
    expect(html).not.toContain("£");
  });

  it("renders the bare figure, not a guessed symbol, before the base currency is known", () => {
    const html = renderToStaticMarkup(<RingView holdings={holdings} baseCurrency={null} />);
    expect(html).toContain("10,000");
    expect(html).not.toContain("£");
  });

  it("marks every legend percentage as a figure", () => {
    const html = renderToStaticMarkup(<RingView holdings={holdings} baseCurrency="GBP" />);
    const pnumPercents = html.match(/class="pnum"[^>]*>\d+%</g) ?? [];
    expect(pnumPercents).toHaveLength(2);
  });
});
