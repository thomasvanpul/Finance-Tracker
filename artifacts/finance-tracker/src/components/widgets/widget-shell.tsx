import { useState } from "react";
import type { ReactNode } from "react";
import { Link } from "wouter";
import { PanelBox } from "../primitives/panel-box";
import { PanelHeader } from "../primitives/panel-header";
import { useDashboardCustomize } from "../../lib/dashboard-customize-context";

interface WidgetShellProps {
  title: string;
  href?: string;
  linkLabel?: string;
  accent?: string;
  children: ReactNode;
  isLoading?: boolean;
  isExpanded?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  emptyAction?: { label: string; href: string };
  headerRight?: ReactNode;
}

export function WidgetShell({
  title, href, linkLabel = "→ View", accent, children,
  isLoading, isExpanded: _isExpanded, isEmpty, emptyMessage, emptyAction,
  headerRight,
}: WidgetShellProps) {
  const [hovered, setHovered] = useState(false);
  const isCustomizing = useDashboardCustomize();
  const accentColor = accent ?? "var(--ft-accent)";

  return (
    <PanelBox>
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Customize mode tints the header. It is a state of the dashboard,
            not of a panel, so the background belongs to WidgetShell — which
            knows about the mode — rather than to PanelBox or PanelHeader,
            both of which stay pure surface. */}
        <PanelHeader
          className={isCustomizing ? "ft-widget-header-customizing" : undefined}
          right={
            <>
              {headerRight}
              {href && (
                <Link href={href}>
                  <span style={{
                    fontSize: 11,
                    fontFamily: "var(--font-sans)",
                    color: hovered ? accentColor : "var(--ft-dim)",
                    cursor: "pointer",
                    fontWeight: 500,
                    textTransform: "none",
                    transition: "color 0.1s",
                    whiteSpace: "nowrap",
                  }}>
                    {linkLabel}
                  </span>
                </Link>
              )}
            </>
          }
        >
          <span style={{
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {title}
          </span>
        </PanelHeader>

        {/* Content */}
        <div style={{ marginTop: 8 }}>
          {isLoading ? (
            <SkeletonRows />
          ) : isEmpty ? (
            <EmptyState message={emptyMessage} action={emptyAction} accent={accentColor} />
          ) : (
            children
          )}
        </div>
      </div>
    </PanelBox>
  );
}

function EmptyState({ message, action, accent }: { message?: string; action?: { label: string; href: string }; accent?: string }) {
  return (
    <div style={{ padding: "24px 14px", display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-start" }}>
      <div style={{
        fontFamily: "var(--font-sans)",
        fontSize: 12,
        color: "var(--ft-dim)",
      }}>
        {message ?? "No data"}
      </div>
      {action && (
        <Link href={action.href}>
          <span style={{
            fontFamily: "var(--font-sans)",
            fontSize: 11,
            fontWeight: 500,
            color: accent ?? "var(--ft-accent)",
            cursor: "pointer",
          }}>
            {action.label} →
          </span>
        </Link>
      )}
    </div>
  );
}

function SkeletonRows() {
  const rows = [
    { label: 38, val: 55 },
    { label: 52, val: 42 },
    { label: 44, val: 60 },
    { label: 60, val: 35 },
    { label: 30, val: 48 },
  ];
  return (
    <div style={{ padding: "10px 12px 14px", display: "flex", flexDirection: "column", gap: 0 }}>
      {/* KPI bar skeleton */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", marginBottom: 12 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ background: "var(--ft-surface)", padding: "10px 10px 8px", borderRight: i < 2 ? "1px solid var(--ft-border)" : undefined }}>
            <div style={{ height: 7, width: "55%", background: "var(--ft-border)", borderRadius: 2, marginBottom: 5, opacity: 0.5, animation: `ft-pulse 1.6s ease-in-out ${i * 0.15}s infinite` }} />
            <div style={{ height: 11, width: "70%", background: "var(--ft-border2)", borderRadius: 2, opacity: 0.35, animation: `ft-pulse 1.6s ease-in-out ${i * 0.15 + 0.1}s infinite` }} />
          </div>
        ))}
      </div>
      {/* Row skeletons */}
      {rows.map(({ label, val }, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: i < rows.length - 1 ? "1px solid var(--ft-border)" : undefined }}>
          <div style={{ height: 8, width: `${label}%`, flex: 1, background: "var(--ft-border)", borderRadius: 2, opacity: 0.4, animation: `ft-pulse 1.6s ease-in-out ${i * 0.1}s infinite` }} />
          <div style={{ height: 8, width: val, flexShrink: 0, background: "var(--ft-border2)", borderRadius: 2, opacity: 0.3, animation: `ft-pulse 1.6s ease-in-out ${i * 0.1 + 0.05}s infinite` }} />
        </div>
      ))}
    </div>
  );
}
