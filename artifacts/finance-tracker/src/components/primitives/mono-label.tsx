import type { ElementType, ReactNode } from "react";

// ── MonoLabel ───────────────────────────────────────────────────────────────
// Named-prop mono uppercase label — the "TOTAL · £ · 3 CURRENCIES" glyph.
//
// Previously carried a `style?` escape hatch. Removed: the hatch was the same
// leak PanelBox suffered from, letting layout-shaped inline objects flow
// through what should be a text primitive. If a caller needs padding /
// background / positioning around the label, wrap it in HStack/VStack — the
// label itself only owns typography.
//
// Prefer <MonoLabel> over <Text mono upper size={9}> for the standard
// dim/uppercase label glyph; <Text> is for arbitrary typography.

interface MonoLabelProps {
  children: ReactNode;
  size?: number;
  color?: string;
  letterSpacing?: string;
  mb?: number | string;
  className?: string;
  as?: ElementType;
}

export function MonoLabel({
  children,
  size = 9,
  color = "var(--ft-dim)",
  letterSpacing = "0.08em",
  mb,
  className,
  as: Tag = "div",
}: MonoLabelProps) {
  return (
    <Tag
      className={className}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: size,
        color,
        letterSpacing,
        textTransform: "uppercase" as const,
        transition: "var(--ft-theme-transition)",
        ...(mb !== undefined ? { marginBottom: mb } : {}),
      }}
    >
      {children}
    </Tag>
  );
}
