import type { ThHTMLAttributes } from "react";

type DataTHProps = Omit<ThHTMLAttributes<HTMLTableCellElement>, "align"> & {
  noRightBorder?: boolean;
  align?: "left" | "center" | "right";
};

export function DataTH({ children, style, className, noRightBorder, align, ...rest }: DataTHProps) {
  return (
    <th
      className={className}
      style={{
        padding: "var(--ft-cell-py) var(--ft-cell-px)",
        fontSize: 10,
        fontWeight: 600,
        color: "var(--ft-dim)",
        background: "var(--ft-surface)",
        borderBottom: "1px solid var(--ft-border2)",
        borderRight: noRightBorder ? "none" : "1px solid var(--ft-border)",
        textTransform: "uppercase" as const,
        letterSpacing: "0.05em",
        whiteSpace: "nowrap" as const,
        verticalAlign: "middle" as const,
        transition: "var(--ft-theme-transition)",
        ...(align !== undefined ? { textAlign: align } : {}),
        ...style,
      }}
      {...rest}
    >
      {children}
    </th>
  );
}
