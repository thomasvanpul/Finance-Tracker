// lib/persona-sync.ts — this module is not only a cache-filler. Since
// OnboardingGate started consulting the server BEFORE deciding whether
// to show the questionnaire, hydratePersonaFromServer also decides
// whether a signed-in user is asked the onboarding questions at all,
// because applyPersonas() sets the onboarding-complete flag.
//
// The case these tests exist for: app_settings.persona is
// `notNull().default("full")` and the row is created lazily on the
// first GET, so a brand-new user reads back "full" having chosen
// nothing. Applying that would skip them past onboarding into an empty
// dashboard — which is what happened the first time the gate was
// reordered.

import { describe, it, expect, vi, beforeEach } from "vitest";

const api = vi.hoisted(() => ({
  getSettingsPersona: vi.fn(),
  updateSettingsPersona: vi.fn(),
  getSettingsTabSlot: vi.fn(),
  updateSettingsTabSlot: vi.fn(),
}));
vi.mock("@workspace/api-client-react", () => api);
vi.mock("@/lib/sidebar-config", () => ({ saveSidebarConfig: vi.fn() }));
vi.mock("@/lib/persona-nav", () => ({ ALL_NAV_HREFS: [] }));

const store = new Map<string, string>();
beforeEach(() => {
  vi.resetModules();
  store.clear();
  api.getSettingsPersona.mockReset();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
  (globalThis as any).window = {
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };
  (globalThis as any).Event = class { constructor(public type: string) {} };
  (globalThis as any).CustomEvent = class { constructor(public type: string) {} };
});

async function hydrate() {
  const { hydratePersonaFromServer } = await import("./persona-sync");
  await hydratePersonaFromServer();
  const { LS_PERSONA_KEY, LS_ONBOARDING_KEY } = await import("./persona");
  return {
    persona: store.get(LS_PERSONA_KEY) ?? null,
    onboarded: store.get(LS_ONBOARDING_KEY) ?? null,
  };
}

describe("hydratePersonaFromServer", () => {
  it("mirrors a deliberate server persona onto a fresh device", async () => {
    // The second-device case: onboarded on the phone, signing in on a
    // laptop with empty localStorage. Must NOT be asked again.
    api.getSettingsPersona.mockResolvedValue({ persona: "wealth" });
    const after = await hydrate();
    expect(after.persona).toBe(JSON.stringify(["wealth"]));
    expect(after.onboarded).toBe("1");
  });

  it("does NOT treat a server 'full' as an answer on a fresh device", async () => {
    // 'full' is the column default handed to every user who has never
    // onboarded. Applying it would mark them complete and skip the
    // questionnaire entirely.
    api.getSettingsPersona.mockResolvedValue({ persona: "full" });
    const after = await hydrate();
    expect(after.persona).toBeNull();
    expect(after.onboarded).toBeNull();
  });

  it("does not clobber a local persona with the server default", async () => {
    api.getSettingsPersona.mockResolvedValue({ persona: "full" });
    store.set("ft-persona", JSON.stringify(["budget"]));
    const after = await hydrate();
    expect(after.persona).toBe(JSON.stringify(["budget"]));
  });

  it("prefers the server when local disagrees with a deliberate choice", async () => {
    api.getSettingsPersona.mockResolvedValue({ persona: "market" });
    store.set("ft-persona", JSON.stringify(["budget"]));
    const after = await hydrate();
    expect(after.persona).toBe(JSON.stringify(["market"]));
  });

  it("leaves everything alone when the request fails", async () => {
    api.getSettingsPersona.mockRejectedValue(new Error("offline"));
    const after = await hydrate();
    expect(after.persona).toBeNull();
    expect(after.onboarded).toBeNull();
  });

  it("ignores a persona the client does not recognise", async () => {
    api.getSettingsPersona.mockResolvedValue({ persona: "tycoon" });
    const after = await hydrate();
    expect(after.persona).toBeNull();
  });
});
