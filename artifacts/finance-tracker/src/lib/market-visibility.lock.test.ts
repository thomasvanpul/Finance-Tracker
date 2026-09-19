// Lock · the client half of the market-data flag fails closed, and every
// tester-visible market surface asks it before rendering.
//
// ── What this stops ────────────────────────────────────────────────────────
// Alpaca's agreement forbids displaying its data to end users, so on a
// deployment with ENABLE_MARKET_DATA unset the server refuses every quote
// route (api-server/src/lib/market-flag.ts and its lock test). That makes
// the server safe. It does not make the client safe: a client that renders
// a Markets tab, a ticker strip or a snapshot widget against a refusing
// server shows a tester an empty market surface that still advertises the
// feature, and one that DEFAULTED to shown would render the data the moment
// a stale bundle met an older server.
//
// So the client rule is the narrower one: false until the server says
// otherwise, false on any error, and false when the field is absent. Not
// knowing is not permission.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

// apiFetch is the native-shell-correct fetch (Lock #17). Mock it rather than
// global fetch so this test also fails if the module stops using it.
const apiFetch = vi.fn();
vi.mock("./api-fetch", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

import {
  marketDataEnabledOnce,
  __resetMarketVisibilityForTesting,
} from "./market-visibility";
import { resolveSlotId, isMarketSlot, MARKET_SLOT_IDS, SLOT_OPTIONS } from "./tab-slot";

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: async () => body };
}

beforeEach(() => {
  __resetMarketVisibilityForTesting();
  apiFetch.mockReset();
});
afterEach(() => {
  __resetMarketVisibilityForTesting();
});

describe("market visibility — fail closed", () => {
  it("marketDataEnabled:true is the only yes", async () => {
    apiFetch.mockResolvedValue(jsonResponse({ marketDataEnabled: true, providers: [] }));
    await expect(marketDataEnabledOnce()).resolves.toBe(true);
  });

  it("an absent field is not a yes — an older server bundle pre-dates the flag", async () => {
    apiFetch.mockResolvedValue(jsonResponse({ providers: [] }));
    await expect(marketDataEnabledOnce()).resolves.toBe(false);
  });

  it("a truthy non-boolean is not a yes", async () => {
    apiFetch.mockResolvedValue(jsonResponse({ marketDataEnabled: "yes" }));
    await expect(marketDataEnabledOnce()).resolves.toBe(false);
  });

  it("a non-ok response is not a yes", async () => {
    apiFetch.mockResolvedValue(jsonResponse({ marketDataEnabled: true }, false));
    await expect(marketDataEnabledOnce()).resolves.toBe(false);
  });

  it("a thrown request is not a yes", async () => {
    apiFetch.mockRejectedValue(new Error("offline"));
    await expect(marketDataEnabledOnce()).resolves.toBe(false);
  });

  it("unparseable JSON is not a yes", async () => {
    apiFetch.mockResolvedValue({ ok: true, json: async () => { throw new Error("bad json"); } });
    await expect(marketDataEnabledOnce()).resolves.toBe(false);
  });

  it("asks the server once per page load however many callers there are", async () => {
    apiFetch.mockResolvedValue(jsonResponse({ marketDataEnabled: true }));
    const answers = await Promise.all([
      marketDataEnabledOnce(), marketDataEnabledOnce(), marketDataEnabledOnce(),
    ]);
    expect(answers).toEqual([true, true, true]);
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("asks the server, not a build-time env flag", () => {
    const src = readFileSync(join(SRC, "lib", "market-visibility.ts"), "utf-8");
    expect(src).toContain("/api/market/providers");
    expect(src).not.toMatch(/import\.meta\.env/);
  });
});

describe("the phone tab slot cannot be pinned to a market screen that is off", () => {
  it("MARKET_SLOT_IDS names every slot whose href is a market route", () => {
    const byHref = SLOT_OPTIONS
      .filter((o) => o.href === "/markets" || o.href === "/watchlist")
      .map((o) => o.id)
      .sort();
    expect([...MARKET_SLOT_IDS].sort()).toEqual(byHref);
  });

  it("a market slot resolves to UPCOMING when the deployment serves no market data", () => {
    for (const id of MARKET_SLOT_IDS) {
      expect(isMarketSlot(id)).toBe(true);
      expect(resolveSlotId(id, false)).toBe("upcoming");
      expect(resolveSlotId(id, true)).toBe(id);
    }
  });

  it("every other slot is untouched in both directions", () => {
    for (const opt of SLOT_OPTIONS) {
      if (isMarketSlot(opt.id)) continue;
      expect(resolveSlotId(opt.id, false)).toBe(opt.id);
      expect(resolveSlotId(opt.id, true)).toBe(opt.id);
    }
  });
});

// Each of these renders, links to, or queries a quote-provider price. If the
// gate is removed from one of them the surface comes back silently — nothing
// else in the suite would notice, because with the server refusing, the
// screen merely looks empty rather than wrong.
const GATED_SURFACES: ReadonlyArray<readonly [string, string]> = [
  ["components/layout.tsx", "desktop ticker strip, market-status badge and Markets nav entry"],
  ["pages/investments.tsx", "markets + derivatives + orders tabs and their quote queries"],
  ["pages/dashboard.tsx", "market-snapshot widget, rendered and offered"],
  ["pages/tax.tsx", "quote lookup behind the disposals view"],
  ["pages/settings.tsx", "terminal-profile slot picker"],
  ["components/mobile/MobileHome.tsx", "phone home markets + news section"],
  ["components/phone/PhoneShell.tsx", "the /markets route itself"],
  ["components/phone/PhoneTabBar.tsx", "a pinned MARKETS slot"],
];

describe("every tester-visible market surface consults the flag", () => {
  for (const [file, what] of GATED_SURFACES) {
    it(`${file} — ${what}`, () => {
      const src = readFileSync(join(SRC, file), "utf-8");
      expect(src).toMatch(/useMarketDataEnabled|resolveSlotId|isMarketSlot/);
    });
  }
});
