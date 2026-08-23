import React from "react";

// ── HStack / VStack ─────────────────────────────────────────────────────────
// Two primitives that absorb the pure-flex inline styles catalogued in
// docs/STYLE-INVENTORY.md (shapes 2, 8, 9, 10, 13).
//
// Deliberately no `style` prop. PanelBox had one and it turned into a leak —
// 6 of 9 call sites kept spreading the old inline object through. Every
// layout intent is expressed with a named prop; if a use needs anything more,
// wrap the stack in a purpose-named component rather than escape-hatching.
//
// Props take primitives (numbers, keywords) rather than raw CSS values, so
// the primitive is the layout vocabulary — not just a shorthand.

type Align = "start" | "center" | "end" | "baseline" | "stretch";
type Justify = "start" | "center" | "end" | "between" | "around" | "evenly";

const ALIGN: Record<Align, React.CSSProperties["alignItems"]> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  baseline: "baseline",
  stretch: "stretch",
};
const JUSTIFY: Record<Justify, React.CSSProperties["justifyContent"]> = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  between: "space-between",
  around: "space-around",
  evenly: "space-evenly",
};

interface StackProps {
  gap?: number | string;
  align?: Align;
  justify?: Justify;
  wrap?: boolean;
  padding?: number | string;
  paddingX?: number | string;
  paddingY?: number | string;
  marginTop?: number | string;
  marginBottom?: number | string;
  /** flex: 1 when true, otherwise the given number. */
  grow?: boolean | number;
  /** flex-shrink. `false` == 0 (never shrink). */
  shrink?: boolean | number;
  /** width: 100% */
  wide?: boolean;
  /** min-width: 0 — the flexbox "text truncates properly" fix. */
  minWidth0?: boolean;
  /** min-width numeric or string. Kept separate from minWidth0 to keep the
   *  common truncation-fix case a single-name boolean. */
  minWidth?: number | string;
  /** min-height: 0 — the flexbox "child can shrink below its content" fix.
   *  Needed when this stack is `grow` inside another flex column and its
   *  own child owns a scroll (chat transcript, settings content). Without
   *  minHeight:0 the child refuses to shrink below its content height and
   *  the container overflows its parent, producing a second scrollbar. */
  minHeight0?: boolean;
  /** max-width in px or CSS string. */
  maxWidth?: number | string;
  /** height in px or CSS string. Layout only — chrome (background, border)
   *  stays on PanelBox, not here. */
  height?: number | string;
  className?: string;
  role?: React.AriaRole;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  children?: React.ReactNode;
}

function build(p: StackProps, direction: "row" | "column"): React.CSSProperties {
  const s: React.CSSProperties = { display: "flex", flexDirection: direction };
  if (p.gap !== undefined) s.gap = p.gap;
  if (p.align) s.alignItems = ALIGN[p.align];
  if (p.justify) s.justifyContent = JUSTIFY[p.justify];
  if (p.wrap) s.flexWrap = "wrap";
  if (p.padding !== undefined) s.padding = p.padding;
  if (p.paddingX !== undefined) {
    s.paddingLeft = p.paddingX;
    s.paddingRight = p.paddingX;
  }
  if (p.paddingY !== undefined) {
    s.paddingTop = p.paddingY;
    s.paddingBottom = p.paddingY;
  }
  if (p.marginTop !== undefined) s.marginTop = p.marginTop;
  if (p.marginBottom !== undefined) s.marginBottom = p.marginBottom;
  if (p.grow === true) s.flex = 1;
  else if (typeof p.grow === "number") s.flex = p.grow;
  if (p.shrink === false) s.flexShrink = 0;
  else if (p.shrink === true) s.flexShrink = 1;
  else if (typeof p.shrink === "number") s.flexShrink = p.shrink;
  if (p.wide) s.width = "100%";
  if (p.minWidth0) s.minWidth = 0;
  if (p.minWidth !== undefined) s.minWidth = p.minWidth;
  if (p.maxWidth !== undefined) s.maxWidth = p.maxWidth;
  if (p.minHeight0) s.minHeight = 0;
  if (p.height !== undefined) s.height = p.height;
  return s;
}

export function HStack(props: StackProps) {
  return (
    <div className={props.className} role={props.role} onClick={props.onClick} style={build(props, "row")}>
      {props.children}
    </div>
  );
}

export function VStack(props: StackProps) {
  return (
    <div className={props.className} role={props.role} onClick={props.onClick} style={build(props, "column")}>
      {props.children}
    </div>
  );
}
