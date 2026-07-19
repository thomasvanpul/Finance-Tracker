import type { ReactNode } from "react";
import { Link } from "wouter";

interface WidgetShellProps {
  title: string;
  href?: string;
  linkLabel?: string;
  accent?: string;
  children: ReactNode;
  isLoading?: boolean;
  isExpanded?: boolean;
}

export function WidgetShell({ title, href, linkLabel = "→ View", accent, children, isLoading, isExpanded: _isExpanded }: WidgetShellProps) {
  return (
    <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", overflow: "hidden" }}>
      <div style={{
        background: "var(--ft-raised)",
        borderBottom: "1px solid var(--ft-border)",
        padding: "0 12px",
        height: 34,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--ft-muted)",
      }}>
        <span>
          <span style={{ color: accent ?? "var(--ft-accent)" }}>·</span>{" "}
          {title}
        </span>
        {href && (
          <Link href={href}>
            <span style={{ fontSize: 10, fontFamily: "var(--font-mono)", color: "var(--ft-accent)", cursor: "pointer", letterSpacing: "0.04em", fontWeight: 400, textTransform: "none" }}>
              {linkLabel}
            </span>
          </Link>
        )}
      </div>
      {isLoading ? <SkeletonRows /> : children}
    </div>
  );
}

function SkeletonRows() {
  return (
    <div style={{ padding: "14px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
      {[100, 75, 90, 60].map(w => (
        <div key={w} style={{
          height: 10,
          background: "var(--ft-border)",
          width: `${w}%`,
          borderRadius: 2,
          opacity: 0.5,
        }} />
      ))}
    </div>
  );
}
