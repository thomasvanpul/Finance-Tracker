// ── Prototype dashboard designs — NOT SHIPPED ───────────────────────────────
//
// Four alternative answers to how the dashboard is organised, built so they
// can be photographed side by side and one of them chosen. They are reached
// ONLY through the `data-proto` attribute on <html>, which the screenshot
// harness stamps under SCREENSHOT_PROTO=<name> and which nothing in the app
// ever sets. Same mechanism as the CSS-only `flat` prototype at the end of
// index.css, extended to a layout because the previous round established
// that CSS alone cannot reach these layouts: the dashboard's structure is
// JSX, not classes.
//
// Delete this file, components/proto/ and the four index.css blocks once a
// direction has been picked.

export const PROTO_DESIGNS = ["ledger", "editorial", "panelled", "bands"] as const;

export type ProtoDesign = (typeof PROTO_DESIGNS)[number];

export function isProtoDesign(value: string | null | undefined): value is ProtoDesign {
  return value != null && (PROTO_DESIGNS as readonly string[]).includes(value);
}
