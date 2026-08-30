import { HoverRow } from "./HoverRow";

// Timeline — dated events with a 1px vertical rail and per-row dot.
// Extracted from profile.tsx:1176. Profile is currently the only site
// but the pattern is worth reserving as a primitive because it fits
// UPCOMING (bills over next N days), REPORTS (statement of dates), and
// any Activity/Audit view we ship later.
//
// Dot IS the row's identity glyph per Amendment :83 (rows representing
// merchants/persons/accounts carry an avatar/logo/glyph) — the dot
// stands in for "an event happened on this date".
//
// Amendment lines followed:
//   :77  mono at var(--ft-text-xs) = 11
//   :83  dot glyph on each row = identity per row
//   :86  vertical rhythm uniform within a list (fixed 8px padding-y)

interface TimelineItem {
  date: string;
  label: string;
  sub?: string;
}

interface TimelineProps {
  items: readonly TimelineItem[];
}

export function Timeline({ items }: TimelineProps) {
  return (
    <div style={{ position: "relative", padding: "12px 12px 12px 28px" }}>
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: 18,
          top: 18,
          bottom: 18,
          width: 1,
          background: "var(--ft-border)",
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {items.map((item, i) => (
          <HoverRow
            key={`${item.date}-${i}`}
            style={{
              position: "relative",
              padding: "8px 8px 8px 14px",
              minHeight: 44,
              borderBottom: i < items.length - 1 ? "1px solid var(--ft-border)" : undefined,
            }}
          >
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: -10,
                top: "50%",
                transform: "translateY(-50%)",
                width: 6,
                height: 6,
                background: "var(--ft-accent)",
                border: "1px solid var(--ft-raised)",
                borderRadius: "50%",
                zIndex: 1,
              }}
            />
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--ft-text-xs)",
                  color: "var(--ft-text)",
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {item.label}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--ft-text-xs)",
                  color: "var(--ft-dim)",
                  letterSpacing: "0.04em",
                  flexShrink: 0,
                }}
              >
                {item.date}
              </div>
            </div>
            {item.sub && (
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--ft-text-xs)",
                  color: "var(--ft-muted)",
                  marginTop: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {item.sub}
              </div>
            )}
          </HoverRow>
        ))}
      </div>
    </div>
  );
}
