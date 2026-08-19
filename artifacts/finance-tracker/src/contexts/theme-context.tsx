import { createContext, useContext, useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import {
  DEFAULT_THEME,
  readCachedTheme,
  writeCachedTheme,
  clearCachedTheme,
  saveThemeToServer,
  fetchThemeFromServer,
} from "@/lib/theme-sync";

export type FintrackTheme = "void" | "phosphor" | "arctic" | "parchment" | "slate" | "linen" | "amber" | "midnight" | "matrix" | "synthwave" | "deep-space" | "mario" | "gilded" | "bloodline";

const THEMES: { id: FintrackTheme; label: string; accent: string; base: string; text: string }[] = [
  { id: "void",       label: "Void",       accent: "#F4A21E", base: "#08090B", text: "#CDD6F4" },
  { id: "phosphor",   label: "Phosphor",   accent: "#7FFF00", base: "#020802", text: "#39FF14" },
  { id: "arctic",     label: "Arctic",     accent: "#0052CC", base: "#F0F4F8", text: "#1A2333" },
  { id: "parchment",  label: "Parchment",  accent: "#7A1F30", base: "#F5EBD8", text: "#241A0C" },
  { id: "slate",      label: "Slate",      accent: "#0E5766", base: "#DFE6EE", text: "#141A22" },
  { id: "linen",      label: "Linen",      accent: "#5A4610", base: "#EEE7D6", text: "#241D0F" },
  { id: "amber",      label: "Amber",      accent: "#FFD700", base: "#0A0600", text: "#FFB000" },
  { id: "midnight",   label: "Midnight",   accent: "#4D9FFF", base: "#010817", text: "#E8F0FF" },
  { id: "matrix",     label: "Matrix",     accent: "#00FF41", base: "#000300", text: "#00CC33" },
  { id: "synthwave",  label: "Synthwave",  accent: "#FF007A", base: "#0D001A", text: "#E8D5FF" },
  { id: "deep-space", label: "Deep Space", accent: "#7B5EA7", base: "#010108", text: "#C8D0E8" },
  { id: "mario",      label: "Mario",      accent: "#F8C800", base: "#5C94FC", text: "#FCFCFC" },
  { id: "gilded",     label: "Gilded",     accent: "#C8941E", base: "#080600", text: "#F0E6C8" },
  { id: "bloodline",  label: "Bloodline",  accent: "#CC1A2F", base: "#0F0003", text: "#F5C2C7" },
];

interface ThemeContextValue {
  theme: FintrackTheme;
  themes: typeof THEMES;
  setTheme: (t: FintrackTheme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  themes: THEMES,
  setTheme: () => {},
});

// Resolution order (explicit — read this before touching the effect
// chain below):
//
// 1. Initial paint: read the localStorage cache and apply it. This
//    exists ONLY to prevent a flash of the wrong theme on reload for
//    a signed-in user. Not the source of truth.
// 2. Session resolves signed-in: fetch the server's theme and apply
//    it. Server wins. Update the cache to match. Any user-triggered
//    setTheme() writes through to the server and updates the cache.
// 3. Session resolves signed-out: apply DEFAULT_THEME and clear the
//    cache. The auth screen must look the same for every first-time
//    visitor — a previous user's theme cannot bleed through.
// 4. Session transitions signed-in → signed-out (sign-out click):
//    same as (3). Clearing the cache is the guarantee that whoever
//    sits down at this browser next gets the default rather than
//    someone else's picked theme.
//
// The signed-out default is 'void' by choice, not inertia. The
// product is a Bloomberg-terminal-shaped personal finance instrument:
// dark by default reads as "instrument, focused, serious" and matches
// the visual argument the whole product makes. Arctic exists as an
// intentional light theme now, but a light first impression would
// pull the product toward the consumer-budgeting-app category it
// deliberately isn't. Void's amber accent also signals value without
// demanding attention — right register for "log in, look at your
// money". A signed-in user on a bright screen still has every other
// theme one click away.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = authClient.useSession();

  // Initial state = cache OR default. Cache is applied for signed-in
  // users' flash-free reload; for signed-out users effect #2 below
  // overwrites it back to DEFAULT_THEME once session resolves.
  const [theme, setThemeState] = useState<FintrackTheme>(() => readCachedTheme() ?? DEFAULT_THEME);

  // Track whether we've observed a signed-in session so a subsequent
  // signed-out transition is recognised as a sign-out (not initial
  // load). Prevents the cache clear on a first-visit signed-out load
  // from being a redundant no-op — it's already a no-op there, but
  // this ref also gates the server hydrate so we only hydrate once
  // per sign-in.
  const hydratedForUserId = useRef<string | null>(null);

  // (1) Apply theme to the DOM whenever state changes. Cache write
  // happens here too so a signed-in user's manual setTheme() lands in
  // localStorage without a separate call site. Cache reset on sign-out
  // is a separate effect below — it explicitly clears rather than
  // relying on this to overwrite with DEFAULT_THEME.
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "void") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", theme);
    }
    writeCachedTheme(theme);
  }, [theme]);

  // (2) Session-driven resolution. Runs whenever session state changes.
  useEffect(() => {
    if (isPending) return;
    const userId = session?.user?.id ?? null;
    if (!userId) {
      // Signed out: force default and clear the cache so the next
      // person at this browser gets the default rather than whatever
      // this session last used. Do this even on a fresh visit —
      // clearing an already-empty cache is cheap and idempotent.
      setThemeState(DEFAULT_THEME);
      clearCachedTheme();
      hydratedForUserId.current = null;
      return;
    }
    // Signed in: hydrate from server once per user session. The cache
    // is already showing (if any) via the initial state; the server
    // fetch may or may not change it.
    if (hydratedForUserId.current === userId) return;
    hydratedForUserId.current = userId;
    void fetchThemeFromServer().then((serverTheme) => {
      if (serverTheme && serverTheme !== theme) {
        setThemeState(serverTheme);
      }
    });
    // theme is intentionally NOT a dep — including it would re-fetch
    // whenever the user changes theme, which is exactly the write path
    // we already handle via setTheme + saveThemeToServer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, isPending]);

  const setTheme = (t: FintrackTheme) => {
    setThemeState(t);
    // Write-through to server IFF signed in. Signed-out setTheme
    // shouldn't happen (there's no UI surface for it pre-auth), but
    // if it ever does, don't try to PUT — we'd 401.
    if (session?.user?.id) {
      void saveThemeToServer(t);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, themes: THEMES, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useFintrackTheme() {
  return useContext(ThemeContext);
}
