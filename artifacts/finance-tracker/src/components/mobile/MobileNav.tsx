import { useState } from "react";
import { useLocation } from "wouter";
import { Plus } from "lucide-react";
import { QuickAddTransaction } from "@/components/quick-add-transaction";
import { useActivePersona } from "@/lib/persona-hook";
import type { PersonaId } from "@/lib/persona";

// ── Unified mobile footer ────────────────────────────────────────────────────
// Single component used on every mobile screen. Five slots:
//   HOME · (slot 2) · (+) · (slot 4) · (slot 5)
// The centre + is the primary add action. It opens QuickAddTransaction and
// sits raised above the nav bar so it reads as part of the navigation, not a
// floating sticker.
//
// Active state is derived from the current URL. Screens the footer does not
// name (e.g. /budget, /portfolio, /reports) leave no tab active — the user is
// somewhere the footer does not map to, and honesty beats false highlighting.
//
// Persona parameterisation (P2·10): ONE component, five slot definitions per
// persona. Slots 1 and 5 stay constant across personas (HOME + FIND) — those
// are the anchors. Slots 2 and 4 vary by persona. This preserves muscle memory
// on cross-persona flips.

type GlyphKind = "filled" | "outline" | "bars" | "ring";

interface FooterTabDef {
  key: string;
  label: string;
  route: string;
  glyph: GlyphKind;
  // Matcher used to decide whether the tab is active from wouter's
  // current location. Route equality first; a matcher lets a "detail"
  // route light the parent tab if we ever want that.
  matches: (location: string) => boolean;
}

const TAB_HOME: FooterTabDef  = { key: "home",   label: "HOME",   route: "/",         glyph: "filled",  matches: (l) => l === "/" || l === "" };
const TAB_MONTH: FooterTabDef = { key: "month",  label: "MONTH",  route: "/upcoming", glyph: "outline", matches: (l) => l === "/upcoming" };
const TAB_MOVE: FooterTabDef  = { key: "move",   label: "MOVE",   route: "/accounts", glyph: "bars",    matches: (l) => l === "/accounts" };
const TAB_FIND: FooterTabDef  = { key: "find",   label: "FIND",   route: "/more",     glyph: "ring",    matches: (l) => l === "/more" };
// Market / wealth / social replacements for slot 2 (MONTH). All keep
// MOVE + FIND at slots 4/5. Routes here are already in MOBILE_ROUTES.
const TAB_PORTFOLIO: FooterTabDef = { key: "portfolio", label: "PORTFOLIO", route: "/investments", glyph: "outline", matches: (l) => l === "/investments" };
const TAB_GOALS: FooterTabDef     = { key: "goals",     label: "GOALS",     route: "/goals",       glyph: "outline", matches: (l) => l === "/goals" };
const TAB_OWING: FooterTabDef     = { key: "owing",     label: "OWING",     route: "/owing",       glyph: "outline", matches: (l) => l === "/owing" };

// Slot 2 varies by persona; slot 4 stays MOVE across the board (every
// persona needs one-tap to their accounts). Slot 5 stays FIND. If a
// future persona also wants to swap MOVE, add a fourth-slot lookup
// here — same shape.
export function tabSetForPersona(persona: PersonaId): FooterTabDef[] {
  const slot2 =
    persona === "market" ? TAB_PORTFOLIO :
    persona === "wealth" ? TAB_GOALS :
    persona === "social" ? TAB_OWING :
    TAB_MONTH;
  return [TAB_HOME, slot2, TAB_MOVE, TAB_FIND];
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

function renderGlyph(kind: GlyphKind, active: boolean) {
  switch (kind) {
    case "filled":  return <GlyphFilled active={active} />;
    case "outline": return <GlyphOutline active={active} />;
    case "bars":    return <GlyphBars active={active} />;
    case "ring":    return <GlyphRing active={active} />;
  }
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
  const persona = useActivePersona();
  const tabs = tabSetForPersona(persona);

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
          <FooterTab
            label={tabs[0]!.label}
            active={tabs[0]!.matches(location)}
            onClick={() => navigate(tabs[0]!.route)}
            glyph={renderGlyph(tabs[0]!.glyph, tabs[0]!.matches(location))}
          />
          <FooterTab
            label={tabs[1]!.label}
            active={tabs[1]!.matches(location)}
            onClick={() => navigate(tabs[1]!.route)}
            glyph={renderGlyph(tabs[1]!.glyph, tabs[1]!.matches(location))}
          />
          {/* Centre slot is deliberately empty — the raised + sits above it */}
          <div />
          <FooterTab
            label={tabs[2]!.label}
            active={tabs[2]!.matches(location)}
            onClick={() => navigate(tabs[2]!.route)}
            glyph={renderGlyph(tabs[2]!.glyph, tabs[2]!.matches(location))}
          />
          <FooterTab
            label={tabs[3]!.label}
            active={tabs[3]!.matches(location)}
            onClick={() => navigate(tabs[3]!.route)}
            glyph={renderGlyph(tabs[3]!.glyph, tabs[3]!.matches(location))}
          />

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
