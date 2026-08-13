import { useState } from "react";
import { useLocation } from "wouter";
import { Plus } from "lucide-react";
import { QuickAddTransaction } from "@/components/quick-add-transaction";

// ── Unified mobile footer ────────────────────────────────────────────────────
// Single component used on every mobile screen. Five slots:
//   HOME · MONTH · (+) · MOVE · FIND
// The centre + is the primary add action. It opens QuickAddTransaction and
// sits raised above the nav bar so it reads as part of the navigation, not a
// floating sticker.
//
// Active state is derived from the current URL. Screens the footer does not
// name (e.g. /budget, /portfolio, /reports) leave no tab active — the user is
// somewhere the footer does not map to, and honesty beats false highlighting.

export type MobileTab = "home" | "month" | "move" | "find";

const ROUTE: Record<MobileTab, string> = {
  home:  "/",
  month: "/upcoming",
  move:  "/accounts",
  find:  "/more",
};

function activeFromLocation(location: string): MobileTab | null {
  if (location === "/" || location === "") return "home";
  if (location === "/upcoming") return "month";
  if (location === "/accounts") return "move";
  if (location === "/more") return "find";
  return null;
}

// Glyph vocab: filled square = HOME, outlined square = MONTH,
// two horizontal lines = MOVE (money moves), circle outline = FIND (a lens).
function GlyphFilled({ active }: { active: boolean }) {
  return (
    <span
      style={{
        width: 16, height: 10,
        background: active ? "var(--ft-text)" : "var(--ft-dim)",
        boxShadow: active ? "4px -4px 0 0 var(--ft-border)" : "none",
        display: "block",
      }}
    />
  );
}
function GlyphOutline({ active }: { active: boolean }) {
  const color = active ? "var(--ft-text)" : "var(--ft-dim)";
  return (
    <span
      style={{
        width: 16, height: 10,
        borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: color,
        borderRightWidth: 1, borderRightStyle: "solid", borderRightColor: color,
        borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: color,
        borderLeftWidth: 1, borderLeftStyle: "solid", borderLeftColor: color,
        boxSizing: "border-box",
        display: "block",
      }}
    />
  );
}
function GlyphBars({ active }: { active: boolean }) {
  const color = active ? "var(--ft-text)" : "var(--ft-dim)";
  return (
    <span
      style={{
        width: 16, height: 10,
        borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: color,
        borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: color,
        display: "block",
      }}
    />
  );
}
function GlyphRing({ active }: { active: boolean }) {
  const color = active ? "var(--ft-text)" : "var(--ft-dim)";
  return (
    <span
      style={{
        width: 10, height: 10,
        borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: color,
        borderRightWidth: 1, borderRightStyle: "solid", borderRightColor: color,
        borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: color,
        borderLeftWidth: 1, borderLeftStyle: "solid", borderLeftColor: color,
        borderRadius: "50%",
        boxSizing: "border-box",
        display: "block",
      }}
    />
  );
}

function FooterTab({
  label,
  active,
  onClick,
  glyph,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  glyph: React.ReactNode;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        color: active ? "var(--ft-text)" : "var(--ft-dim)",
        cursor: "pointer",
        userSelect: "none",
        minHeight: 44,
      }}
    >
      {glyph}
      {label}
    </div>
  );
}

export function MobileNav() {
  const [location, navigate] = useLocation();
  const [addOpen, setAddOpen] = useState(false);
  const active = activeFromLocation(location);

  return (
    <>
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          height: "calc(60px + env(safe-area-inset-bottom, 0px))",
          background: "var(--ft-base)",
          borderTopWidth: 1,
          borderTopStyle: "solid",
          borderTopColor: "var(--ft-border)",
          zIndex: 100,
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <div
          style={{
            position: "relative",
            height: 60,
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.08em",
          }}
        >
          <FooterTab label="HOME"  active={active === "home"}  onClick={() => navigate(ROUTE.home)}  glyph={<GlyphFilled active={active === "home"} />} />
          <FooterTab label="MONTH" active={active === "month"} onClick={() => navigate(ROUTE.month)} glyph={<GlyphOutline active={active === "month"} />} />
          {/* Centre slot is deliberately empty — the raised + sits above it */}
          <div />
          <FooterTab label="MOVE"  active={active === "move"}  onClick={() => navigate(ROUTE.move)}  glyph={<GlyphBars active={active === "move"} />} />
          <FooterTab label="FIND"  active={active === "find"}  onClick={() => navigate(ROUTE.find)}  glyph={<GlyphRing active={active === "find"} />} />

          {/* Raised centre add button */}
          <div
            onClick={() => setAddOpen(true)}
            role="button"
            aria-label="Add a transaction"
            style={{
              position: "absolute",
              top: -14,
              left: "50%",
              transform: "translateX(-50%)",
              width: 44,
              height: 44,
              borderRadius: 2,
              background: "var(--ft-accent)",
              color: "var(--ft-base)",
              borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "var(--ft-border)",
              borderRightWidth: 1, borderRightStyle: "solid", borderRightColor: "var(--ft-border)",
              borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "var(--ft-border)",
              borderLeftWidth: 1, borderLeftStyle: "solid", borderLeftColor: "var(--ft-border)",
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <Plus size={22} strokeWidth={2} />
          </div>
        </div>
      </div>

      <QuickAddTransaction open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
}
