// Lock: a free-tier model must not be reachable by adding a string.
//
// Until 2026-09-11 the chain's last lane sent users' financial summaries,
// transaction descriptions and receipt photos to free OpenRouter models
// whose hosts' terms forbid personal data (docs/DATA-INVENTORY.md §4.1).
// The lane is gone; this file makes sure no config string brings it back.
//
//   1. The policy refuses every `:free` variant and the `openrouter/free`
//      router, and lets paid ids through (a blanket provider ban would be
//      the wrong lock — a paid model may later be legitimate).
//   2. No non-test source file in the api-server carries a model id
//      ending in the free suffix. This is the test the task asked for:
//      it fails the moment one is typed into a provider configuration.
//   3. Every model the providers are configured with passes the policy.
//   4. An env override to a free model is refused in the transport with
//      no request sent, for both the one-shot and the streaming call.
//   5. Boot verification reports a refused model as unverified, so
//      /api/ai/status does not call the lane available.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { refusedModelReason, isRefusedModel } from "./model-policy";
import { groqAllModels, groqChat, groqChatStream } from "./groq";
import { cerebrasAllModels } from "./cerebras";
import { registerProvider, __resetProviderHealthForTesting } from "../provider-health";
import { verifyProvidersAtBoot, getAiHealth, __resetAiHealthForTesting } from "../ai-config";

const SRC_ROOT = fileURLToPath(new URL("../../", import.meta.url));

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(ts|tsx|js|mjs|cjs|json)$/.test(name) && !/\.test\.ts$/.test(name)) out.push(full);
  }
  return out;
}

describe("model policy · what is refused", () => {
  it("refuses the three models the chain used to call", () => {
    for (const id of [
      "nvidia/nemotron-3-super-120b-a12b:free",
      "nvidia/nemotron-nano-9b-v2:free",
      "google/gemma-4-31b-it:free",
    ]) {
      expect(isRefusedModel(id)).toBe(true);
    }
  });

  it("refuses any :free variant, whatever the case or surrounding whitespace", () => {
    expect(isRefusedModel("some-vendor/new-model:free")).toBe(true);
    expect(isRefusedModel("Some-Vendor/New-Model:FREE")).toBe(true);
    expect(isRefusedModel("  vendor/model:free  ")).toBe(true);
  });

  it("refuses the openrouter/free router, which has no suffix but routes to free models", () => {
    expect(isRefusedModel("openrouter/free")).toBe(true);
    expect(refusedModelReason("openrouter/free")).toMatch(/free-tier/);
  });

  it("lets paid ids through — the lock is on free models, not on a provider", () => {
    for (const id of [
      "openai/gpt-oss-120b",
      "gpt-oss-120b",
      "qwen/qwen3.6-27b",
      "nvidia/nemotron-3-super-120b-a12b",
      "google/gemma-4-31b-it",
      "vendor/freeform-model",
    ]) {
      expect(refusedModelReason(id)).toBeNull();
    }
  });
});

describe("model policy · no free model id in api-server source", () => {
  it("no non-test source file contains a string literal ending in :free", () => {
    const LITERAL = /["'`]([^"'`\s]+:free)["'`]/gi;
    const hits: string[] = [];
    for (const file of sourceFiles(SRC_ROOT)) {
      const text = readFileSync(file, "utf8");
      for (const m of text.matchAll(LITERAL)) {
        const line = text.slice(0, m.index).split("\n").length;
        hits.push(`${relative(SRC_ROOT, file)}:${line} — ${m[1]}`);
      }
    }
    expect(hits, `Free-tier model ids are refused (lib/ai-providers/model-policy.ts). Offenders:\n  ${hits.join("\n  ")}`).toEqual([]);
  });

  it("the scan actually reads the provider configuration files", () => {
    // Guard against the scan silently covering nothing (a moved root).
    const scanned = sourceFiles(SRC_ROOT).map((f) => relative(SRC_ROOT, f));
    expect(scanned).toContain(join("lib", "ai-providers", "groq.ts"));
    expect(scanned).toContain(join("lib", "ai-providers", "cerebras.ts"));
    expect(scanned).toContain(join("lib", "ai-config.ts"));
  });

  it("every configured provider model passes the policy", () => {
    for (const m of [...groqAllModels(), ...cerebrasAllModels()]) {
      expect(refusedModelReason(m), m).toBeNull();
    }
  });
});

describe("model policy · enforced in the transport", () => {
  const ENV_KEYS = ["GROQ_API_KEY", "GROQ_CHAT_MODEL", "CEREBRAS_API_KEY"];
  const saved: Record<string, string | undefined> = {};
  let fetchCalls: string[] = [];

  beforeEach(() => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    process.env.GROQ_API_KEY = "gsk_TEST_KEY_ABC";
    process.env.GROQ_CHAT_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";
    delete process.env.CEREBRAS_API_KEY;
    fetchCalls = [];
    vi.stubGlobal("fetch", async (url: string) => {
      fetchCalls.push(String(url));
      return {
        ok: true, status: 200, statusText: "OK",
        text: async () => JSON.stringify({ choices: [{ message: { content: "should never be read" } }] }),
        json: async () => ({ data: [{ id: "nvidia/nemotron-3-super-120b-a12b:free" }] }),
      } as unknown as Response;
    });
    __resetProviderHealthForTesting();
    registerProvider({ name: "groq", configured: true });
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    vi.unstubAllGlobals();
    __resetAiHealthForTesting();
  });

  it("one-shot call: env override to a free model throws and sends nothing", async () => {
    await expect(
      groqChat({ messages: [{ role: "user", content: "net worth" }], route: "test" }),
    ).rejects.toThrow(/refused by policy/);
    expect(fetchCalls).toEqual([]);
  });

  it("streaming call: env override to a free model throws before the first token and sends nothing", async () => {
    const stream = groqChatStream({ messages: [{ role: "user", content: "net worth" }], route: "test" });
    await expect(stream.next()).rejects.toThrow(/refused by policy/);
    expect(fetchCalls).toEqual([]);
  });

  it("boot verification marks a refused model unverified without fetching, so status is not available", async () => {
    __resetAiHealthForTesting();
    await verifyProvidersAtBoot();
    const health = getAiHealth();
    const groq = health.providers.find((p) => p.name === "groq");
    expect(groq?.modelsVerified).toBe(false);
    expect(groq?.lastError).toMatch(/REFUSED/);
    expect(health.available).toBe(false);
    expect(fetchCalls).toEqual([]);
  });
});
