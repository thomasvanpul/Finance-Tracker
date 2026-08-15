import type { ElementType, ReactNode, MouseEventHandler, AriaRole } from "react";

// ── Text ────────────────────────────────────────────────────────────────────
// Named-prop typographic primitive. Absorbs the pure-text inline styles that
// dominate pages/investments.tsx (177), pages/analytics.tsx (132),
// pages/settings.tsx (107), pages/transactions.tsx (66) — see docs/STYLE-
// INVENTORY.md for the running total.
//
// Deliberately no `style` prop. StackProps precedent, PanelBox lesson:
// MonoLabel had one and it turned into a leak — every layout-shaped need
// got funneled through the escape hatch instead of picking a real primitive.
// Every text intent is a named prop; if a use needs anything more, either
// (a) add the prop here, or (b) wrap the surrounding element in HStack/VStack.
//
// Rules:
//   - Text is for text. If the element also carries padding, background,
//     border, or positioning, wrap it in a layout primitive instead.
//   - `numeric` adds .pnum for tabular figures. The pnum class no longer
//     ellipsises (P1 fix), so numeric callers must guarantee container
//     width or use figureFits() from block-field.tsx to gate render.
//   - `truncate` is available for identifier text (names, descriptions) —
//     NOT for numeric values. Enforced by making them mutually exclusive.

// CSS accepts 100–900 in 100s plus "normal" | "bold" | number. Keep numeric
// so callers don't need to think — the migration script emits raw numbers.
type Weight = number;
type Align = "left" | "center" | "right";

interface TextBase {
  size?: number;
  weight?: Weight;
  color?: string;
  mono?: boolean;
  upper?: boolean;
  letterSpacing?: string | number;
  lineHeight?: number | string;
  align?: Align;
  nowrap?: boolean;
  mb?: number | string;
  mt?: number | string;
  as?: ElementType;
  className?: string;
  role?: AriaRole;
  onClick?: MouseEventHandler<HTMLElement>;
  children?: ReactNode;
}

// Mutually exclusive: either you're truncating identifier text, or you're
// rendering a financial figure (numeric). Never both — a truncated £ figure
// is the P1 defect the codebase now forbids.
interface TextTruncate extends TextBase { truncate: true; numeric?: never }
interface TextNumeric extends TextBase { numeric: true; truncate?: never }
interface TextPlain extends TextBase { truncate?: never; numeric?: never }
export type TextProps = TextTruncate | TextNumeric | TextPlain;

export function Text(props: TextProps) {
  const Tag: ElementType = props.as ?? "span";
  const style: React.CSSProperties = {};
  if (props.size !== undefined) style.fontSize = props.size;
  if (props.weight !== undefined) style.fontWeight = props.weight;
  if (props.color !== undefined) style.color = props.color;
  if (props.mono) style.fontFamily = "var(--font-mono)";
  if (props.upper) style.textTransform = "uppercase";
  if (props.letterSpacing !== undefined) style.letterSpacing = props.letterSpacing;
  if (props.lineHeight !== undefined) style.lineHeight = props.lineHeight;
  if (props.align) style.textAlign = props.align;
  if (props.nowrap) style.whiteSpace = "nowrap";
  if (props.mb !== undefined) style.marginBottom = props.mb;
  if (props.mt !== undefined) style.marginTop = props.mt;
  if ("truncate" in props && props.truncate) {
    style.overflow = "hidden";
    style.textOverflow = "ellipsis";
    style.whiteSpace = "nowrap";
    style.minWidth = 0;
  }
  const classes = [props.className, "numeric" in props && props.numeric ? "pnum" : undefined].filter(Boolean).join(" ") || undefined;
  return (
    <Tag className={classes} role={props.role} onClick={props.onClick} style={style}>
      {props.children}
    </Tag>
  );
}
