import type { ElementType, ReactNode, CSSProperties } from "react";

interface MonoLabelProps {
  children: ReactNode;
  size?: number;
  color?: string;
  letterSpacing?: string;
  mb?: number | string;
  style?: CSSProperties;
  className?: string;
  as?: ElementType;
}

export function MonoLabel({
  children,
  size = 9,
  color = "var(--ft-dim)",
  letterSpacing = "0.08em",
  mb,
  style,
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
        ...style,
      }}
    >
      {children}
    </Tag>
  );
}
