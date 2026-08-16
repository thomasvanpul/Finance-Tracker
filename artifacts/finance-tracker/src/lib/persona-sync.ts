// Persona sync between server and localStorage.
//
// The server column app_settings.persona is the source of truth across
// devices and sessions. The eight components that already read
// persona (kpi-bar, keyboard-shortcuts, command-palette,
// notifications-panel, layout, persona-quick-start, onboarding,
// settings) read it synchronously from localStorage via
// loadPersonaIds(). Rewriting them all to be async is out of scope
// for F1b — instead we hydrate localStorage from the server once at
// app boot and write back whenever the user changes their persona.

import { updateSettingsPersona, getSettingsPersona } from "@workspace/api-client-react";
import { applyPersonas, loadPersonaIds, type PersonaId } from "./persona";

const VALID: readonly PersonaId[] = ["market", "budget", "wealth", "social", "full"];

function isValidPersona(x: unknown): x is PersonaId {
  return typeof x === "string" && (VALID as readonly string[]).includes(x);
}

// Best-effort write. Called from onboarding and from a future "change
// persona" settings row. Swallows errors — a 401 (session expired)
// will be caught by the auth guard on next navigation, and any other
// failure just leaves the server value stale; the local persona still
// works. Do NOT throw here; the caller has already applied locally.
export async function savePersonaToServer(persona: PersonaId): Promise<void> {
  try {
    await updateSettingsPersona({ persona });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[persona-sync] failed to save persona to server:", err);
  }
}

// Boot-time hydrate. Called from a top-level effect. If the server
// has a persona and localStorage doesn't reflect it, apply the server
// one locally so every synchronous loadPersonaIds() reader sees the
// truth. If the server has "full" (the default) and localStorage
// already has a non-full persona, we do NOT overwrite — that would
// clobber a fresh onboarding that has not yet round-tripped.
export async function hydratePersonaFromServer(): Promise<void> {
  let serverPersona: PersonaId | null = null;
  try {
    const { persona } = await getSettingsPersona();
    if (isValidPersona(persona)) serverPersona = persona;
  } catch {
    return; // offline or 401; nothing to hydrate
  }
  if (!serverPersona) return;
  const local = loadPersonaIds();
  if (local.length === 0) {
    // Fresh device / cleared storage — mirror the server.
    applyPersonas([serverPersona]);
    return;
  }
  // If localStorage already matches OR is different from a stored
  // non-default server value, prefer the server. Skip when server is
  // full and local isn't — treat "full" as "no explicit choice yet".
  if (serverPersona === "full" && local[0] !== "full") return;
  if (local[0] !== serverPersona) {
    applyPersonas([serverPersona]);
  }
}
