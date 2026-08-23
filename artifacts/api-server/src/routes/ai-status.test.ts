// Endpoint lock for /api/ai/status (multi-provider shape).
//
// The endpoint's semantic contract, iterated four times to lock the
// "AI IS BROKEN and status says it's fine" defect:
//
//   v1: {available: keyPresent}                       — invisible dead model
//   v2: adds per-Gemini-model verification            — Gemini truthful
//   v3: reports per-provider (Groq, Cerebras, Gemini) — chain truthful
//   v4: Gemini replaced by OpenRouter                 — no permanently
//       red lane (Google's AI Studio issues AQ.-prefixed keys the
//       Generative Language REST API cannot accept, so the Gemini lane
//       was structurally impossible to make green on this account)
//
// `available` at the top level is true iff at least one provider has
// keyConfigured AND modelsVerified=true. That means "the chain has a
// live lane it could actually serve a request from right now" — the
// honest semantic the whole architecture is designed to keep truthful.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import router from "./ai-status";
import { __setProviderHealthForTesting, __resetAiHealthForTesting } from "../lib/ai-config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callStatus(): Promise<any> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layer = (router as any).stack.find((l: any) => l?.route?.path === "/ai/status");
    if (!layer) return reject(new Error("route not found"));
    const handler = layer.route.stack[0].handle as (req: unknown, res: unknown) => void;
    handler({} as unknown, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      json: (body: any) => resolve(body),
    } as unknown);
  });
}

// Snapshot then restore process.env so tests don't leak.
const ORIGINAL_ENV: Record<string, string | undefined> = {};
const KEYS = ["GROQ_API_KEY", "CEREBRAS_API_KEY", "OPENROUTER_API_KEY"];

beforeEach(() => {
  for (const k of KEYS) ORIGINAL_ENV[k] = process.env[k];
  for (const k of KEYS) delete process.env[k];
  __resetAiHealthForTesting();
});
afterEach(() => {
  for (const k of KEYS) {
    if (ORIGINAL_ENV[k] === undefined) delete process.env[k];
    else process.env[k] = ORIGINAL_ENV[k];
  }
});

describe("/api/ai/status · available field truthfulness", () => {
  it("available=false when NO provider is verified (all keys missing)", async () => {
    const body = await callStatus();
    expect(body.available).toBe(false);
    // Every provider is listed even when unconfigured — silent
    // omission would let an operator conclude a provider isn't
    // supported at all.
    const names = body.providers.map((p: { name: string }) => p.name).sort();
    expect(names).toEqual(["cerebras", "groq", "openrouter"]);
    for (const p of body.providers) {
      expect(p.keyConfigured).toBe(false);
      expect(p.modelsVerified).toBeNull();
    }
  });

  it("available=false when keys ARE set but verification hasn't run (null)", async () => {
    // The three-month bug shape at the provider level: keys set,
    // verification pending, endpoint MUST NOT report available=true
    // just because a key exists. Once boot check confirms, this flips.
    process.env.GROQ_API_KEY = "gsk_sentinel";
    process.env.CEREBRAS_API_KEY = "csk_sentinel";
    process.env.OPENROUTER_API_KEY = "sk-or-v1-sentinel";
    __resetAiHealthForTesting();
    const body = await callStatus();
    expect(body.available).toBe(false);
    for (const p of body.providers) {
      expect(p.keyConfigured).toBe(true);
      expect(p.modelsVerified).toBeNull();
    }
  });

  it("available=false when every provider's verification FAILED", async () => {
    // All three providers checked, all three have a dead model. This
    // is the "chain has no live lane" condition — must report false.
    process.env.GROQ_API_KEY = "gsk_sentinel";
    process.env.CEREBRAS_API_KEY = "csk_sentinel";
    process.env.OPENROUTER_API_KEY = "sk-or-v1-sentinel";
    __resetAiHealthForTesting();
    __setProviderHealthForTesting("groq",       { keyConfigured: true, modelsVerified: false, lastError: "CONFIGURED AI MODEL IS DEAD (groq)" });
    __setProviderHealthForTesting("cerebras",   { keyConfigured: true, modelsVerified: false, lastError: "CONFIGURED AI MODEL IS DEAD (cerebras)" });
    __setProviderHealthForTesting("openrouter", { keyConfigured: true, modelsVerified: false, lastError: "CONFIGURED AI MODEL IS DEAD (openrouter)" });
    const body = await callStatus();
    expect(body.available).toBe(false);
    // Fix-me sentence per provider — the operator sees exactly which
    // env var to change for which provider.
    const groq       = body.providers.find((p: { name: string }) => p.name === "groq");
    const cerebras   = body.providers.find((p: { name: string }) => p.name === "cerebras");
    const openrouter = body.providers.find((p: { name: string }) => p.name === "openrouter");
    expect(groq.lastError).toContain("groq");
    expect(cerebras.lastError).toContain("cerebras");
    expect(openrouter.lastError).toContain("openrouter");
  });

  it("available=true when AT LEAST ONE provider is keyed AND verified", async () => {
    // The point of the chain: one live lane is enough. Cerebras + OpenRouter
    // dead, Groq live → chain serves via Groq → available:true.
    process.env.GROQ_API_KEY = "gsk_sentinel";
    __resetAiHealthForTesting();
    __setProviderHealthForTesting("groq", { keyConfigured: true, modelsVerified: true, lastError: null });
    const body = await callStatus();
    expect(body.available).toBe(true);
  });

  it("available=true when only the tertiary OpenRouter lane is live", async () => {
    // Regression guard: available shouldn't require the primary. Any
    // provider being live is enough.
    process.env.OPENROUTER_API_KEY = "sk-or-v1-sentinel";
    __resetAiHealthForTesting();
    __setProviderHealthForTesting("openrouter", { keyConfigured: true, modelsVerified: true, lastError: null });
    const body = await callStatus();
    expect(body.available).toBe(true);
  });
});

describe("/api/ai/status · response shape", () => {
  it("providers array carries exactly the diagnostic fields, no more", async () => {
    process.env.GROQ_API_KEY = "gsk_sentinel";
    __resetAiHealthForTesting();
    __setProviderHealthForTesting("groq", { keyConfigured: true, modelsVerified: true, lastError: null });
    const body = await callStatus();
    // Top-level shape lock.
    expect(new Set(Object.keys(body))).toEqual(new Set(["available", "providers"]));
    // Per-provider shape lock. Widening requires updating this test —
    // no field can be added silently that might leak (key hash, userId,
    // upstream URL, model list from full body, etc.).
    for (const p of body.providers) {
      expect(new Set(Object.keys(p))).toEqual(
        new Set(["name", "keyConfigured", "models", "modelsVerified", "verifiedAt", "lastError"]),
      );
    }
  });

  it("does not leak any API key in any field", async () => {
    process.env.GROQ_API_KEY = "gsk_SENTINEL_GROQ_9EE7";
    process.env.CEREBRAS_API_KEY = "csk_SENTINEL_CEREBRAS_9EE7";
    process.env.OPENROUTER_API_KEY = "sk-or-v1-SENTINEL_OPENROUTER_9EE7";
    __resetAiHealthForTesting();
    __setProviderHealthForTesting("groq",       { keyConfigured: true, modelsVerified: true, lastError: null });
    __setProviderHealthForTesting("cerebras",   { keyConfigured: true, modelsVerified: true, lastError: null });
    __setProviderHealthForTesting("openrouter", { keyConfigured: true, modelsVerified: true, lastError: null });
    const body = await callStatus();
    const serialised = JSON.stringify(body);
    for (const sentinel of ["SENTINEL_GROQ_9EE7", "SENTINEL_CEREBRAS_9EE7", "SENTINEL_OPENROUTER_9EE7"]) {
      expect(serialised).not.toContain(sentinel);
    }
  });
});
