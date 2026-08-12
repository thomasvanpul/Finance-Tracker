import type { TdHTMLAttributes } from "react";

type DataTDProps = Omit<TdHTMLAttributes<HTMLTableCellElement>, "align"> & {
  noRightBorder?: boolean;
  numeric?: boolean;
  mono?: boolean;
  bold?: boolean;
};

export function DataTD({ children, style, className, noRightBorder, numeric, mono, bold, ...rest }: DataTDProps) {
  return (
    <td
      className={className}
      style={{
        padding: "var(--ft-cell-py) var(--ft-cell-px)",
        fontSize: 12,
        borderBottom: "1px solid var(--ft-border)",
        borderRight: noRightBorder ? "none" : "1px solid var(--ft-border)",
        color: "var(--ft-text)",
        whiteSpace: "nowrap" as const,
        transition: "var(--ft-theme-transition)",
        ...(numeric ? { textAlign: "right" as const, fontFamily: "var(--font-mono)" } : {}),
        ...(mono && !numeric ? { fontFamily: "var(--font-mono)" } : {}),
        ...(bold ? { fontWeight: 700 } : {}),
        ...style,
      }}
      {...rest}
    >
      {children}
    </td>
  );
}
