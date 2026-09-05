import { useSyncExternalStore } from "react";
import { Link, useLocation } from "wouter";
import {
  CalendarClock,
  ChartCandlestick,
  Eye,
  Handshake,
  House,
  Landmark,
  LayoutGrid,
  Receipt,
  type LucideIcon,
} from "lucide-react";
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

// One glyph per position, above the label. Icons plus labels is the
// phone convention — it is what every native tab bar the user already
// owns does — and the text-only bar read as a terminal menu: four words
// in 11px mono with nothing for the eye to land on. The record is
// exhaustive over every fixed key and slot id, so a new slot option
// cannot ship without a glyph.
const TAB_ICONS: Record<TabKey, LucideIcon> = {
  home: House,
  worth: Landmark,
  directory: LayoutGrid,
  spending: Receipt,
  markets: ChartCandlestick,
  upcoming: CalendarClock,
  owing: Handshake,
  watchlist: Eye,
};

// 2px active rule + 6 top + 20 glyph + 3 gap + 13 label line + 5 bottom
// = 49, the native tab-bar height, comfortably over the Amendment's
// 44px floor (the text-only bar sat at exactly 44 — measured, not a
// margin). The label stays at 11px, the Amendment's minimum type size.
const TAB_MIN_HEIGHT = 49;
const GLYPH_SIZE = 20;

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
        background: "var(--ft-surface)",
        // The 1px rule is the boundary, same as every frame on desktop.
        // The old bar also floated on a 24px shadow; depth is decoration
        // here (MOBILE-CONCEPT: value by length or area, never depth),
        // and the hairline already separates content from chrome.
        borderTop: "1px solid var(--ft-border)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {tabs.map((tab) => {
        const active = isActive(tab, loc);
        const Glyph = TAB_ICONS[tab.key];
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            style={{
              minHeight: TAB_MIN_HEIGHT,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 3,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.06em",
              whiteSpace: "nowrap",
              color: active ? "var(--ft-accent)" : "var(--ft-muted)",
              textDecoration: "none",
              borderTop: active ? "2px solid var(--ft-accent)" : "2px solid transparent",
              marginTop: -1,
              cursor: "pointer",
              padding: "6px 2px 5px",
            }}
          >
            <Glyph size={GLYPH_SIZE} strokeWidth={active ? 2 : 1.5} aria-hidden="true" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
