import { Drill } from "@/components/drill";
import type { Insight } from "@/lib/spending-insights";
import { figureSegments } from "@/lib/figure-segments";
import { PHONE_GROUP_GAP, PHONE_GUTTER, PHONE_ROW_PY } from "./rhythm";

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
// A ruled band, not a card. Until 16 Sep 2026 this was a 16px-radius
// floating card with elevation and an × — a toast, used as page content,
// in the middle of a page where every other group is separated by a
// full-bleed rule. It now is one of those groups: a hairline above and
// below, full bleed, on the page's own background, text on the 16px edge.
//
// DESIGN.md §6 gives an ephemeral surface radius and elevation so it can be
// told from a permanent one. This takes the trade §18 already took for the
// desktop's insight band: in a ruled register a floating card is the one
// thing on the page announcing itself, so "this will go" is carried by the
// control instead — a worded Hide, not an icon, because an × in a corner is
// the notification idiom this is leaving.
//
// Amendment lines followed (src/index.css:47–94):
//   :74  ≥44px tap target on Hide
//   :77  11px floor; body sits at 13px
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
      // A stable hook for the screenshot harness, which has to be able to
      // tell "the slot is empty" from "the harness could not find the slot".
      // Same purpose as [data-skeleton] elsewhere.
      data-insight-slot={insight.source}
      style={{
        marginBottom: PHONE_GROUP_GAP,
        padding: `${PHONE_ROW_PY}px 0 ${PHONE_ROW_PY}px ${PHONE_GUTTER}px`,
        borderTop: "1px solid var(--ft-border)",
        borderBottom: "1px solid var(--ft-border)",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
        {/* When the headline is a figure the app computed from rows, it is a
            way into those rows (DESIGN.md §14). The producer decides, by
            setting drillHref; the slot stays dumb. */}
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            lineHeight: "20px",
            color: "var(--ft-text)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {insight.drillHref
            ? <Drill href={insight.drillHref}><Figures text={insight.headline} /></Drill>
            : <Figures text={insight.headline} />}
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
          <Figures text={insight.body} />
        </div>
        {insight.action && (
          <button
            type="button"
            onClick={insight.action.onTap}
            style={{
              alignSelf: "flex-start",
              minHeight: 32,       // inline; the band's own height and Hide carry the outer 44
              padding: "4px 0 0",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--font-sans)",
              fontSize: 13,
              fontWeight: 600,
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
          padding: `0 ${PHONE_GUTTER}px 0 8px`,
          background: "none",
          border: "none",
          borderLeft: "1px solid var(--ft-border)",
          cursor: "pointer",
          fontFamily: "var(--font-sans)",
          fontSize: 13,
          color: "var(--ft-dim)",
        }}
      >
        Hide
      </button>
    </div>
  );
}

// Producers hand the slot strings, so a figure in one ("£31 outstanding for
// 74 days.") has no element of its own and privacy mode, which blurs `.pnum`,
// left it readable. Each money or percentage figure gets its own `.pnum`.
function Figures({ text }: { text: string }) {
  return (
    <>
      {figureSegments(text).map((part, i) =>
        part.figure ? <span key={i} className="pnum">{part.text}</span> : part.text,
      )}
    </>
  );
}
