// DESIGN.md §8 / CLAUDE.md: a figure is shown in full or not at all. A data
// secondary line carries figures — WORTH's "AAPL · 12.5 shares", UPCOMING's
// "3 Oct · 4d late" — so it must never be ellipsised or cropped. A language
// secondary (a category or account name) has no figure and may still ellipsise.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PhoneEntityRow } from "./PhoneEntityRow";

function secondarySpan(html: string, text: string): string {
  const at = html.indexOf(`>${text}<`);
  expect(at).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf("<span", at), at);
}

describe("PhoneEntityRow secondary line", () => {
  it("never crops a data secondary that carries a figure", () => {
    const text = "AAPL · 12.5 shares";
    const span = secondarySpan(renderToStaticMarkup(<PhoneEntityRow primary="Apple" secondary={text} />), text);
    expect(span).not.toContain("text-overflow:ellipsis");
    expect(span).not.toContain("overflow:hidden");
    expect(span).not.toContain("white-space:nowrap");
  });

  it("still ellipsises a language secondary, which holds no figure", () => {
    const text = "Groceries · Monzo Current";
    const span = secondarySpan(
      renderToStaticMarkup(<PhoneEntityRow primary="Tesco" secondary={text} secondaryMono={false} />),
      text,
    );
    expect(span).toContain("text-overflow:ellipsis");
  });
});
