import type { ReactNode } from "react";
import { PanelBox } from "./panel-box";
import { PanelHeader } from "./panel-header";

// ── Panel ───────────────────────────────────────────────────────────────────
// PanelBox + PanelHeader in one call: the framed section every page is built
// from. 1px --ft-border at all times, zero radius, header inside the frame.
// Composition only — surface stays on PanelBox, typography on the header.

interface PanelProps {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Padding around the body only; the header keeps its own. */
  padding?: number | string;
}

export function Panel({ title, right, children, className, padding }: PanelProps) {
  return (
    <PanelBox className={className}>
      {title !== undefined && <PanelHeader right={right}>{title}</PanelHeader>}
      {padding !== undefined ? <div style={{ padding }}>{children}</div> : children}
    </PanelBox>
  );
}
