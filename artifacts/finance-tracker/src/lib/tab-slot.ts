// The one variable position in the phone tab bar.
//
// The tab bar has four positions: HOME · WORTH · [slot] · DIRECTORY.
// The slot holds the user's highest-priority context — SPENDING for
// budget users, MARKETS for market users — set by their persona by
// default and overrideable in Settings › Terminal Profile.
//
// The tab bar controls emphasis, not access. Hiding a slot never deletes
// a feature; all content remains reachable from DIRECTORY or by URL.
//
// NOT the MobileNav customiser deleted at f05fcab (2026-08-27). That
// version let users build the entire bar from eleven options, producing
// bars so divergent that nothing could be screenshotted or supported.
// One slot from four positions stays predictable while making the app
// fit a person rather than a category.
//
// Storage: localStorage "nr-tab-slot". Migrates to user_preferences via
// G20/B when that lands — same pattern as "nr-dismissed-insights".

import type { PersonaId } from "./persona";

export type SlotId = "spending" | "markets" | "upcoming" | "owing" | "watchlist";

export interface SlotOption {
  id: SlotId;
  href: string;
  label: string;
  aliases: readonly string[];
  /** A phone-native screen exists for this slot. False = not yet selectable. */
  available: boolean;
}

export const SLOT_OPTIONS: readonly SlotOption[] = [
  {
    id: "spending",
    href: "/spending",
    label: "SPENDING",
    aliases: ["/transactions", "/budget", "/analytics", "/cashflow"],
    available: true,
  },
  {
    id: "markets",
    href: "/markets",
    label: "MARKETS",
    aliases: [],
    available: true,
  },
  {
    id: "upcoming",
    href: "/upcoming",
    label: "UPCOMING",
    aliases: ["/recurring", "/subscriptions", "/calendar"],
    available: true,
  },
  {
    id: "owing",
    href: "/owing",
    label: "OWING",
    aliases: [],
    available: false, // requires OwingScreen (currently a wrapped desktop page)
  },
  {
    id: "watchlist",
    href: "/watchlist",
    label: "WATCHLIST",
    aliases: [],
    available: false, // requires WatchlistScreen + watchlist_items API table
  },
];

// Persona defaults. When the user has no saved override, this is the slot
// they see. The choice reflects each persona's primary financial context.
const DEFAULT_SLOT: Record<PersonaId, SlotId> = {
  market:  "markets",
  budget:  "spending",
  wealth:  "spending",
  social:  "spending", // intended: "owing" — update to "owing" when OwingScreen ships
  full:    "spending",
};

export const LS_SLOT_KEY = "nr-tab-slot";
export const SLOT_UPDATE_EVENT = "nr-tab-slot-update";

export function slotOptionById(id: SlotId): SlotOption {
  return SLOT_OPTIONS.find((o) => o.id === id) ?? SLOT_OPTIONS[0];
}

export function slotIdForPersona(persona: PersonaId): SlotId {
  return DEFAULT_SLOT[persona];
}

// The user's saved override, or null if they have none (following persona default).
export function loadSlotId(): SlotId | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(LS_SLOT_KEY);
  if (!raw) return null;
  const opt = SLOT_OPTIONS.find((o) => o.id === raw && o.available);
  return opt ? (raw as SlotId) : null;
}

// Pin a slot choice and notify subscribers immediately.
export function saveSlotId(id: SlotId): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(LS_SLOT_KEY, id);
  window.dispatchEvent(new Event(SLOT_UPDATE_EVENT));
}

// Remove the user's override, returning the slot to the persona default.
export function clearSlotId(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(LS_SLOT_KEY);
  window.dispatchEvent(new Event(SLOT_UPDATE_EVENT));
}

// The slot the tab bar actually shows: saved override if any, persona default otherwise.
export function effectiveSlotId(persona: PersonaId): SlotId {
  return loadSlotId() ?? slotIdForPersona(persona);
}
