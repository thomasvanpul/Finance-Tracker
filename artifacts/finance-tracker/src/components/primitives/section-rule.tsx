import type { ReactNode } from "react";

// ── SectionRule ─────────────────────────────────────────────────────────────
// The header for unframed page structure — DESIGN.md § 6, species one.
//
// PanelHeader is a panel's internal rule and only ever appears inside a
// frame. Structure has no frame: it sits on --ft-base, separated from what
// follows by a hairline and by spacing. SectionRule is that hairline plus
// the label, with no horizontal inset, so the label and the content beneath
// it align to the page's content edge rather than to a container that is
// not drawn.
//
// Same label class, same height, same hairline as PanelHeader. The only
// difference is the padding and the absence of a box around it — which is
// the point: a frame says "this is one object", and the page is not an
// object.
//
// No `style?` escape hatch — see the primitives rule in CLAUDE.md.

interface SectionRuleProps {
  children: ReactNode;
  right?: ReactNode;
  className?: string;
}

export function SectionRule({ children, right, className }: SectionRuleProps) {
  return (
    <div
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        minHeight: "var(--ft-panel-header-h)",
        borderBottom: "1px solid var(--ft-border)",
        transition: "var(--ft-theme-transition)",
      }}
    >
      <span className="ft-panel-label" style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
        {children}
      </span>
      {right !== undefined && right !== null && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {right}
        </div>
      )}
    </div>
  );
}
