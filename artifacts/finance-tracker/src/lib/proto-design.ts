// ── Prototype dashboard designs — NOT SHIPPED ───────────────────────────────
//
// Alternative answers to what the dashboard IS, built so they can be
// photographed side by side and parts of them chosen. They are reached ONLY
// through the `data-proto` attribute on <html>, which the screenshot harness
// stamps under SCREENSHOT_PROTO=<name> and which nothing in the app ever
// sets. Same mechanism as the CSS-only `flat` prototype at the end of
// index.css, extended to a layout because CSS alone cannot reach these
// layouts: the dashboard's structure is JSX, not classes.
//
// ── Round 1 (superseded) ────────────────────────────────────────────────────
// ledger · editorial · panelled · bands. Four structural variations of the
// same product: the same three widgets, rearranged. They were rejected for
// exactly that — "all really poor", "still Numeris with the boxes moved" —
// and they are kept only so the comparison can be re-shot against them.
//
// ── Round 2 ─────────────────────────────────────────────────────────────────
// Eight, each built against a named external reference and each drawing its
// OWN marks from the shared data in components/proto/proto-data.ts. Nothing
// in this round renders a registry widget, which is the specific correction:
// NET WORTH, SAVINGS GOALS and the sankey are the product's visual
// signature, and any page containing them reads as the same product no
// matter how the page is arranged.
//
//   mercury     Mercury — one enormous figure, whitespace, no edges at all
//   stripe      Stripe Dashboard — tables as the primary surface
//   terminal    Bloomberg — maximum density, alignment doing all the work
//   linear      Linear — dark-first restraint, one accent, three type sizes
//   ramp        Ramp — the page as a queue of anomalies, not a total
//   plausible   Plausible — one chart and ranked lists, zero configuration
//   broadsheet  a newspaper front page — ranked by importance, not category
//   timeline    (free choice) — the dashboard as a log; a balance is a
//               reading taken at a point on a spine, not a headline
//
// Delete this file, components/proto/ and the four index.css `flat` blocks
// once a direction has been picked.

export const PROTO_DESIGNS = [
  // Round 1
  "ledger", "editorial", "panelled", "bands",
  // Round 2
  "mercury", "stripe", "terminal", "linear", "ramp", "plausible", "broadsheet", "timeline",
] as const;

export type ProtoDesign = (typeof PROTO_DESIGNS)[number];

export function isProtoDesign(value: string | null | undefined): value is ProtoDesign {
  return value != null && (PROTO_DESIGNS as readonly string[]).includes(value);
}
