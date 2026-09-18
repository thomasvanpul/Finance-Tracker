import { SectionHeader } from "@/components/phone/SectionHeader";
import { PHONE_GROUP_GAP, PHONE_HEADER_H } from "@/components/phone/rhythm";

// ── HOME section header (label + link) ──────────────────────────────────────
// The shared phone SectionHeader is the titlebar; this only supplies the
// right-slot link and the gap that separates one home section from the last
// (components/phone/rhythm.ts, DESIGN.md §3). Moved out of MobileHome on 16 Sep 2026 so MarketPane and
// NewsPane draw the same header as CASHFLOW and COMING: until then HOME
// carried two header designs, a band and a ruled dim label, one above the
// other.
export function HomeSectionHeader({
  label,
  link,
  onLink,
}: {
  label: string;
  link: string;
  onLink: () => void;
}) {
  return (
    <div style={{ marginTop: PHONE_GROUP_GAP }}>
      <SectionHeader
        label={label}
        right={
          <a
            onClick={(e) => {
              e.preventDefault();
              onLink();
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 44,
              // The link keeps a 44px tap target inside a 30px header, so
              // the overflow is cancelled rather than paid for in height.
              margin: `${-(44 - PHONE_HEADER_H) / 2}px 0`,
              fontWeight: 400,
              color: "var(--ft-dim)",
              textDecoration: "none",
              cursor: "pointer",
            }}
          >
            {link}
          </a>
        }
      />
    </div>
  );
}
