// The desktop dashboard lets a widget be picked up by holding anywhere on it
// for 250ms. A press on a control inside the widget — Spending Breakdown's
// "Previous month" chevron — must stay a click: measured 1 Oct 2026, a 300ms
// press on that chevron started a drag, the pointerup landed on the drag
// layer, no click fired, and the widget remounted with its month reset.
import { describe, expect, it } from "vitest";
import { LongPressPointerSensor } from "./long-press-sensor";

type FakeEl = { tag: string; parentElement: FakeEl | null; matches: (sel: string) => boolean };

function el(tag: string, parent: FakeEl | null, role?: string): FakeEl {
  return {
    tag,
    parentElement: parent,
    matches: (sel: string) =>
      sel.split(",").map(s => s.trim()).some(s => s === tag || (role != null && s === `[role="${role}"]`)),
  };
}

function press(target: FakeEl, currentTarget: FakeEl) {
  const handler = LongPressPointerSensor.activators[0].handler;
  const event = { target, currentTarget, nativeEvent: { isPrimary: true, button: 0 } };
  return handler(event as never, { onActivation: () => {} } as never);
}

describe("LongPressPointerSensor", () => {
  // dnd-kit's attributes give the sortable wrapper role="button" itself.
  const wrapper = el("div", null, "button");
  const body = el("div", wrapper);

  it("starts a long-press on the widget body", () => {
    expect(press(el("span", body), wrapper)).toBe(true);
  });

  it("does not start one from a button inside the widget", () => {
    const button = el("button", body);
    expect(press(el("svg", button), wrapper)).toBe(false);
  });

  it("does not start one from a form control inside the widget", () => {
    expect(press(el("input", body), wrapper)).toBe(false);
    expect(press(el("select", body), wrapper)).toBe(false);
  });

  it("still ignores a non-primary button", () => {
    const handler = LongPressPointerSensor.activators[0].handler;
    const event = { target: body, currentTarget: wrapper, nativeEvent: { isPrimary: true, button: 2 } };
    expect(handler(event as never, { onActivation: () => {} } as never)).toBe(false);
  });
});
