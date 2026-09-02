import { useSyncExternalStore } from "react";
import { Link, useLocation } from "wouter";
import { useActivePersona } from "@/lib/persona-hook";
import {
  loadSlotId,
  slotIdForPersona,
  slotOptionById,
  SLOT_UPDATE_EVENT,
  type SlotOption,
} from "@/lib/tab-slot";

// The phone tab bar has four positions:
//   HOME · WORTH · [chosen slot] · DIRECTORY
//
// Three positions are fixed for everyone. The third position holds the
// user's highest-priority context — SPENDING for budget users, MARKETS
// for market users — set by their persona by default and overrideable in
// Settings › Terminal Profile.
//
// The slot is reactive: changing the persona or pinning a different slot
// in settings updates the tab bar immediately without a page reload.
//
// NOT the MobileNav customiser deleted at f05fcab (2026-08-27). That
// version let users build the entire bar from eleven options, producing
// bars so divergent that nothing could be screenshotted or supported.
// One slot from four positions stays predictable while making the app fit
// a person rather than a category. See docs/BACKLOG.md § D4 and
// Atlas/Projects/Finance-Tracker.md §§ 22–24 for the reasoning behind
// fixed structure and the decision to add one variable slot.

type Tab = {
  key: string;
  href: string;
  label: string;
  aliases: readonly string[];
};

const FIXED_BEFORE: readonly Tab[] = [
  { key: "home",  href: "/",      label: "HOME",  aliases: [] },
  { key: "worth", href: "/worth", label: "WORTH", aliases: ["/accounts", "/net-worth", "/portfolio", "/investments"] },
];
const FIXED_AFTER: readonly Tab[] = [
  { key: "directory", href: "/directory", label: "DIRECTORY", aliases: [] },
];

// URLs that make the DIRECTORY tab appear active. Kept in sync manually
// with PhoneShell's wrapped and desktop-only routes.
const DIRECTORY_MEMBERS: ReadonlySet<string> = new Set([
  "/goals", "/health-score",
  "/whatif", "/pension", "/fire", "/projection", "/mortgage", "/tax", "/calculators",
  "/owing", "/split", "/shared",
  "/ai-coach", "/briefing",
  "/reports", "/year-review", "/decisions",
  "/business", "/family", "/trading",
  "/import",
  "/profile", "/settings",
]);

function isActive(tab: Tab, loc: string): boolean {
  if (tab.key === "home") return loc === "/" || loc === "";
  if (tab.href === loc) return true;
  if (tab.aliases.includes(loc)) return true;
  if (tab.key === "directory" && DIRECTORY_MEMBERS.has(loc)) return true;
  return false;
}

function slotToTab(opt: SlotOption): Tab {
  return { key: opt.id, href: opt.href, label: opt.label, aliases: opt.aliases };
}

export function PhoneTabBar() {
  const [loc] = useLocation();
  const persona = useActivePersona();

  // Subscribe to user-pinned slot changes. The persona hook already handles
  // persona changes; this subscription covers the user-override layer only.
  const savedSlotId = useSyncExternalStore(
    (cb) => {
      window.addEventListener(SLOT_UPDATE_EVENT, cb);
      return () => window.removeEventListener(SLOT_UPDATE_EVENT, cb);
    },
    loadSlotId,
    () => null,
  );

  const slot = slotToTab(slotOptionById(savedSlotId ?? slotIdForPersona(persona)));
  const tabs = [...FIXED_BEFORE, slot, ...FIXED_AFTER];

  return (
    <nav
      aria-label="Primary"
      style={{
        flexShrink: 0,
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        background: "var(--ft-surface)",
        borderTop: "1px solid var(--ft-border)",
        // Mobile Amendment :67 permits elevation on floating surfaces.
        // The border above keeps the hairline separation between content
        // and chrome; the shadow gives the tab bar the sense of hovering.
        boxShadow: "0 -8px 24px rgba(0, 0, 0, 0.12)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {tabs.map((tab) => {
        const active = isActive(tab, loc);
        return (
          <Link
            key={tab.key}
            href={tab.href}
            style={{
              minHeight: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.08em",
              color: active ? "var(--ft-accent)" : "var(--ft-dim)",
              textDecoration: "none",
              borderTop: active ? "2px solid var(--ft-accent)" : "2px solid transparent",
              marginTop: -1,
              cursor: "pointer",
              padding: "10px 4px",
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
