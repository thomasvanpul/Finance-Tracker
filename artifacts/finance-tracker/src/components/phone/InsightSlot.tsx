import { X } from "lucide-react";
import type { Insight } from "@/lib/spending-insights";

// InsightSlot — the one-insight-or-nothing container on SPENDING.
// Pure presentation. Empty in the common case; that is correct, not a
// failure. See lib/spending-insights.ts for the selection contract
// (which single thing do we say, and why this one).
//
// The slot is deliberately dumb: it renders whatever it's handed and
// forwards a dismiss id. Selection happens above. That keeps producers
// pure (txs → Insight | null), keeps the slot a leaf, and lets the
// screen swap producers in later without touching the layout.
//
// Amendment lines followed (src/index.css:47–94):
//   :54  border-radius 16 on the card (in range 16-24)
//   :74  ≥44px tap target on the dismiss button (padding gets us there
//        without a giant visual X)
//   :77  11px floor on the mono label; body sits at 13px
//   :78  no dead space — when insight is null, the slot returns null
//        entirely, not a placeholder. Empty is the message.

interface InsightSlotProps {
  insight: Insight | null;
  onDismiss: (id: string) => void;
}

export function InsightSlot({ insight, onDismiss }: InsightSlotProps) {
  if (insight == null) return null;

  return (
    <div
      role="status"
      style={{
        margin: "0 16px 12px",
        padding: "14px 14px 12px 16px",
        background: "var(--ft-surface)",
        border: "1px solid var(--ft-border)",
        borderRadius: 16,
        display: "flex",
        gap: 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            lineHeight: "20px",
            letterSpacing: "-0.01em",
            color: "var(--ft-text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {insight.headline}
        </div>
        <div
          style={{
            fontSize: 13,
            lineHeight: "18px",
            color: "var(--ft-muted)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {insight.body}
        </div>
        {insight.action && (
          <button
            type="button"
            onClick={insight.action.onTap}
            style={{
              alignSelf: "flex-start",
              minHeight: 32,       // action is inline; slot-wrapper carries the outer 44 via dismiss + tap area
              padding: "6px 0 0",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--ft-accent)",
            }}
          >
            {insight.action.label} ›
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => onDismiss(insight.id)}
        aria-label="Dismiss insight"
        style={{
          flexShrink: 0,
          minWidth: 44,
          minHeight: 44,
          marginTop: -6,     // aligns X with headline baseline
          marginRight: -6,
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--ft-dim)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "flex-end",
          padding: "6px",
        }}
      >
        <X style={{ width: 16, height: 16 }} />
      </button>
    </div>
  );
}
