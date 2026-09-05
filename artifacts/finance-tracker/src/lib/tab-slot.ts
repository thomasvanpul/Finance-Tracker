// The one variable position in the phone tab bar.
//
// The tab bar has four positions: HOME · WORTH · [slot] · DIRECTORY.
// The slot holds the user's highest-priority context — SPENDING for
// budget users, MARKETS for market users — set by their persona by
// default and overrideable in Settings › Terminal Profile.
//
// The tab bar controls emphasis, not access. Hiding a slot never deletes
// a feature; all content remains reachable from DIRECTORY or by URL, and
// /spending stays permanently out of WRAPPED_ROUTES so a markets user
// following a link still gets the full screen.
//
// NOT the MobileNav customiser deleted at f05fcab (2026-08-27). That
// version let users build the entire bar from eleven options, producing
// bars so divergent that nothing could be screenshotted or supported.
// One slot from four positions stays predictable while making the app
// fit a person rather than a category.
//
// Storage: the server column app_settings.tab_slot is the source of
// truth, so the choice follows the user from laptop to phone (a
// localStorage-only nav choice would be one more stranded key of the
// kind BACKLOG § G20 logs). localStorage "nr-tab-slot" is a read cache so
// the bar paints the right slot on first frame instead of after a round
// trip — same shape as theme-sync.ts. Server wins on hydrate, including
// a server null, which clears a stale local pin.

import { getSettingsTabSlot, updateSettingsTabSlot } from "@workspace/api-client-react";
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

// The three fixed positions. Exported so Lock #18 asserts tab-URL purity
// against the real definitions rather than a hand-copied list.
export interface FixedTab {
  key: "home" | "worth" | "directory";
  href: string;
  label: string;
  aliases: readonly string[];
}

export const FIXED_TABS_BEFORE: readonly FixedTab[] = [
  { key: "home",  href: "/",      label: "HOME",  aliases: [] },
  { key: "worth", href: "/worth", label: "WORTH", aliases: ["/accounts", "/net-worth", "/portfolio", "/investments"] },
];
export const FIXED_TABS_AFTER: readonly FixedTab[] = [
  { key: "directory", href: "/directory", label: "DIRECTORY", aliases: [] },
];

// Every URL a tab owns across every set a user can pick: the fixed tabs,
// every *available* slot option, and all their aliases. The union over
// all sets is the right thing to assert disjointness on, because any
// user can pick any available slot — a URL that is tab-owned in one set
// is tab-owned in the app.
export function tabOwnedUrls(): readonly string[] {
  const out: string[] = [];
  for (const t of [...FIXED_TABS_BEFORE, ...FIXED_TABS_AFTER]) out.push(t.href, ...t.aliases);
  for (const o of SLOT_OPTIONS) if (o.available) out.push(o.href, ...o.aliases);
  return out;
}

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

function isAvailableSlotId(x: unknown): x is SlotId {
  return typeof x === "string" && SLOT_OPTIONS.some((o) => o.id === x && o.available);
}

function notify(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SLOT_UPDATE_EVENT));
}

// ── cache (localStorage) ─────────────────────────────────────────────────

// The user's cached override, or null if they have none (following persona default).
export function loadSlotId(): SlotId | null {
  try {
    const raw = localStorage.getItem(LS_SLOT_KEY);
    return isAvailableSlotId(raw) ? raw : null;
  } catch {
    return null;
  }
}

function writeCache(id: SlotId | null): void {
  try {
    if (id === null) localStorage.removeItem(LS_SLOT_KEY);
    else localStorage.setItem(LS_SLOT_KEY, id);
  } catch {
    // ignore — the server still has it; the next hydrate repaints
  }
}

// Sign-out: drop the cache so the next person at this browser does not
// see the previous user's slot for one frame before their own hydrate.
export function clearSlotCache(): void {
  writeCache(null);
  notify();
}

// ── server ───────────────────────────────────────────────────────────────

// Best-effort write. The local cache is already applied and subscribers
// already notified; a failure here leaves the server stale until the
// next change. Never throws. (Offline durability is G20/A's job.)
async function saveSlotToServer(id: SlotId | null): Promise<void> {
  try {
    await updateSettingsTabSlot({ tabSlot: id });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[tab-slot] failed to save tab slot to server:", err);
  }
}

// Boot-time hydrate, called once the user is signed in and onboarded.
// The server value wins outright — including null, which clears a local
// pin the user removed on another device. Returns silently when the
// request fails (offline, 401) so the cache keeps painting.
export async function hydrateTabSlotFromServer(): Promise<void> {
  let server: SlotId | null;
  try {
    const { tabSlot } = await getSettingsTabSlot();
    server = isAvailableSlotId(tabSlot) ? tabSlot : null;
  } catch {
    return;
  }
  if (server === loadSlotId()) return;
  writeCache(server);
  notify();
}

// ── user actions ─────────────────────────────────────────────────────────

// Pin a slot choice: cache, notify subscribers immediately, then write through.
export function saveSlotId(id: SlotId): void {
  writeCache(id);
  notify();
  void saveSlotToServer(id);
}

// Remove the user's override, returning the slot to the persona default.
export function clearSlotId(): void {
  writeCache(null);
  notify();
  void saveSlotToServer(null);
}

// The slot the tab bar actually shows: saved override if any, persona default otherwise.
export function effectiveSlotId(persona: PersonaId): SlotId {
  return loadSlotId() ?? slotIdForPersona(persona);
}
