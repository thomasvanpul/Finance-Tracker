// Reactive persona hook.
//
// The eight persona-consuming components (kpi-bar, keyboard-shortcuts,
// command-palette, notifications-panel, layout, persona-quick-start,
// onboarding, settings) historically read `loadPersonaIds()` on mount
// and never re-read. That was fine when persona was set once in
// onboarding and never changed. Post-F1a it can change via:
//   - hydratePersonaFromServer (cross-device sync)
//   - a future settings row (not built yet)
//   - a storage event from another browser tab
//
// This hook centralises the subscription so every consumer re-renders
// on `nr-persona-update` (fired by applyPersonas) AND on cross-tab
// storage events for LS_PERSONA_KEY.

import { useEffect, useSyncExternalStore } from "react";
import {
  LS_PERSONA_KEY,
  PERSONA_UPDATE_EVENT,
  applyPersonas,
  loadPersonaIds,
  type PersonaId,
} from "./persona";

function getSnapshot(): PersonaId {
  return (loadPersonaIds()[0] as PersonaId) ?? "full";
}

function getServerSnapshot(): PersonaId {
  return "full";
}

function subscribe(onChange: () => void): () => void {
  const handler = () => onChange();
  window.addEventListener(PERSONA_UPDATE_EVENT, handler);
  return () => window.removeEventListener(PERSONA_UPDATE_EVENT, handler);
}

// Cross-tab: when another tab writes ft-persona to localStorage, mirror
// it into this tab by re-running applyPersonas (which rebuilds sidebar,
// widgets, default page, and fires nr-persona-update locally). This
// lives at module scope, not in every hook call, so we install it once.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== LS_PERSONA_KEY || !e.newValue) return;
    try {
      const ids = JSON.parse(e.newValue) as PersonaId[];
      if (ids.length > 0) applyPersonas(ids);
    } catch {
      /* ignore malformed */
    }
  });
}

export function useActivePersona(): PersonaId {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// Escape hatch: components with heavier state that just want a
// bump-on-change instead of the persona value itself.
export function usePersonaBumper(): void {
  const persona = useActivePersona();
  useEffect(() => {
    /* no-op; the useActivePersona call above is what causes re-render */
    void persona;
  }, [persona]);
}
