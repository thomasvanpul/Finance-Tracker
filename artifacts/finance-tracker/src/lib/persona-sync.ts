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

// Boot-time hydrate, and the gate that decides whether a signed-in
// user is asked the onboarding questions at all (App.tsx ·
// OnboardingGate). If the server has a persona and localStorage
// doesn't reflect it, apply the server one locally so every
// synchronous loadPersonaIds() reader sees the truth.
//
// "full" from the server is NOT treated as an answer, on any device.
// app_settings.persona is `notNull().default("full")` and the row is
// created lazily by ensureSettings() on the first GET, so a user who
// has never onboarded and a user who deliberately chose "full" are
// indistinguishable over the wire — both read back "full". Applying it
// would be inventing a choice the user has not made, and because
// applyPersonas() sets the onboarding-complete flag as a side effect,
// it would skip a brand-new user straight past onboarding into an
// empty 23-widget dashboard.
//
// The cost of that caution is that someone who genuinely chose "full"
// (including via Skip) is asked again on a second device. Closing that
// last case needs the server to record that a choice was made — see
// the note in .review/report.md; it is a schema change, not a client
// one.
export async function hydratePersonaFromServer(): Promise<void> {
  let serverPersona: PersonaId | null = null;
  try {
    const { persona } = await getSettingsPersona();
    if (isValidPersona(persona)) serverPersona = persona;
  } catch {
    return; // offline or 401; nothing to hydrate
  }
  if (!serverPersona || serverPersona === "full") return;
  const local = loadPersonaIds();
  if (local.length === 0) {
    // Fresh device / cleared storage — mirror the server. This is the
    // second-device path: it also marks onboarding complete, so the
    // user is not asked the questions a second time.
    applyPersonas([serverPersona]);
    return;
  }
  if (local[0] !== serverPersona) {
    applyPersonas([serverPersona]);
  }
}
