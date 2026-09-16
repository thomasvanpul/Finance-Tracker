import { SectionHeader } from "@/components/phone/SectionHeader";

// ── HOME section header (label + link) ──────────────────────────────────────
// The shared phone SectionHeader is the titlebar; this only supplies the
// right-slot link and the 16px that separates one home section from the last
// (DESIGN.md §3). Moved out of MobileHome on 16 Sep 2026 so MarketPane and
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
    <div style={{ marginTop: 16 }}>
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
              margin: "-5px 0",
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
