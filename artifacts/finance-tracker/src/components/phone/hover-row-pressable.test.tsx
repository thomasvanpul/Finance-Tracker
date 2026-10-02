import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HoverRow, pressKeyActivates } from "./HoverRow";

// DESIGN.md §14 and the 16 Sep phone-design-rules §13 table: every pressable
// phone row (PhoneEntityRow on WORTH and SPENDING, KeyValueRow) is a HoverRow
// with an onClick — a <div> with no role and no keyboard path, so a keyboard
// or screen-reader user could not open the row at all. A row with no onClick
// is not pressable and must not claim to be.

describe("HoverRow is a button only when it can be pressed", () => {
  it("a pressable row is announced as a button and is focusable", () => {
    const html = renderToStaticMarkup(<HoverRow onClick={() => {}}>Monzo</HoverRow>);
    expect(html).toMatch(/role="button"/);
    expect(html).toMatch(/tabindex="0"/);
  });

  it("a row with no onClick carries neither", () => {
    const html = renderToStaticMarkup(<HoverRow>Monzo</HoverRow>);
    expect(html).not.toMatch(/role=/);
    expect(html).not.toMatch(/tabindex=/);
  });

  it("Enter and Space activate it; other keys do not", () => {
    expect(pressKeyActivates("Enter")).toBe(true);
    expect(pressKeyActivates(" ")).toBe(true);
    expect(pressKeyActivates("Tab")).toBe(false);
    expect(pressKeyActivates("a")).toBe(false);
  });
});
