import { useSyncExternalStore } from "react";
import { Link, useLocation } from "wouter";
import { useActivePersona } from "@/lib/persona-hook";
import {
  FIXED_TABS_AFTER,
  FIXED_TABS_BEFORE,
  loadSlotId,
  slotIdForPersona,
  slotOptionById,
  SLOT_UPDATE_EVENT,
  type FixedTab,
  type SlotId,
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
// in settings updates the tab bar immediately without a page reload. The
// pin itself is an account-level preference (app_settings.tab_slot) with
// localStorage as a first-paint cache — see lib/tab-slot.ts.
//
// NOT the MobileNav customiser deleted at f05fcab (2026-08-27). That
// version let users build the entire bar from eleven options, producing
// bars so divergent that nothing could be screenshotted or supported.
// One slot from four positions stays predictable while making the app fit
// a person rather than a category. See docs/BACKLOG.md § D4 and
// Atlas/Projects/Finance-Tracker.md §§ 22–24 for the reasoning behind
// fixed structure and the decision to add one variable slot.

type TabKey = FixedTab["key"] | SlotId;

type Tab = {
  key: TabKey;
  href: string;
  label: string;
  aliases: readonly string[];
};

// Four words on rules, not four pictures. Until 16 Sep 2026 this was a
// stock icon set — a house, a bank, a receipt, a grid of squares — over
// mono labels: the one element on either surface that looked like every
// other app, and the loudest generated-app tell on the phone.
//
// The phone equivalent of the desktop sidebar (DESIGN.md §12) is the
// sidebar's own treatment laid on its side:
//   · labels are language, so they are sans (§10), at 13px;
//   · positions are divided by hairlines, the way the desktop divides a
//     strip of readings, and the bar sits on one hairline above;
//   · the active position is --ft-accent-tint with an --ft-accent-edge
//     edge and a 600 label, exactly the sidebar's active row. No stripe on
//     any edge (§4) — the 2px top rule this used to carry was one.
// The active state does not rest on hue: the filled cell and the heavier
// label both read in greyscale.
//
// 48 is over the Amendment's 44px floor with room for the edge.
const TAB_MIN_HEIGHT = 48;
const LABEL_SIZE = 13;

// Tab labels are stored upper-case in lib/tab-slot.ts, which Lock #18 and
// the settings picker also read. The bar sets them as words.
function asWord(label: string): string {
  return label.charAt(0) + label.slice(1).toLowerCase();
}

// The fixed positions live in lib/tab-slot.ts next to the slot options so
// Lock #18 can assert tab-URL purity against one definition.
const FIXED_BEFORE: readonly Tab[] = FIXED_TABS_BEFORE.map((t: FixedTab) => ({ ...t }));
const FIXED_AFTER: readonly Tab[] = FIXED_TABS_AFTER.map((t: FixedTab) => ({ ...t }));

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
        background: "var(--ft-base)",
        borderTop: "1px solid var(--ft-border)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {tabs.map((tab, i) => {
        const active = isActive(tab, loc);
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            style={{
              minHeight: TAB_MIN_HEIGHT,
              minWidth: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-sans)",
              fontSize: LABEL_SIZE,
              fontWeight: active ? 600 : 400,
              whiteSpace: "nowrap",
              color: active ? "var(--ft-text)" : "var(--ft-muted)",
              background: active ? "var(--ft-accent-tint)" : "transparent",
              borderLeft: i > 0 ? "1px solid var(--ft-border)" : "none",
              outline: active ? "1px solid var(--ft-accent-edge)" : "none",
              outlineOffset: -1,
              textDecoration: "none",
              cursor: "pointer",
              padding: "0 4px",
            }}
          >
            {asWord(tab.label)}
          </Link>
        );
      })}
    </nav>
  );
}
