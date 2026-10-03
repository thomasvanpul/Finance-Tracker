// BACKLOG § I7 — AI is opt-in. Every AI request in the SPA goes through
// apiFetch (the generated client has no AI endpoints, and the api-fetch
// lock forbids a raw fetch to /api), so apiFetch is where the client holds
// an AI request back until the user has turned AI on: no network request
// at all, and a 403 shaped exactly like the server's refusal, so every
// caller's existing error path shows the reason. The server enforces the
// same rule (api-server lib/ai-consent.ts); this half is what stops the
// dashboard insight panel from sending anything on mount.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

class FakeStorage {
  private map = new Map<string, string>();
  getItem(k: string): string | null { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string): void { this.map.set(k, String(v)); }
  removeItem(k: string): void { this.map.delete(k); }
  clear(): void { this.map.clear(); }
}

vi.mock("./native-auth", () => ({ isNativeShell: () => false, loadNativeAuthToken: async () => null }));

const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));

beforeEach(() => {
  (globalThis as any).localStorage = new FakeStorage();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const { apiFetch } = await import("./api-fetch");
const { AI_ENABLED_KEY, isAiEnabled, isAiRequestPath } = await import("./ai-enabled");

describe("AI switch, client half (I7)", () => {
  it("is off until the user turns it on", () => {
    expect(isAiEnabled()).toBe(false);
    localStorage.setItem(AI_ENABLED_KEY, "false");
    expect(isAiEnabled()).toBe(false);
    localStorage.setItem(AI_ENABLED_KEY, "true");
    expect(isAiEnabled()).toBe(true);
  });

  it("classifies the AI-spending paths, and only those", () => {
    expect(isAiRequestPath("/api/ai/chat")).toBe(true);
    expect(isAiRequestPath("/api/ai/batch-categorize")).toBe(true);
    expect(isAiRequestPath("/api/ai/receipt-split")).toBe(true);
    expect(isAiRequestPath("/api/receipt/parse")).toBe(true);
    // status is public and carries no user data — it says whether a provider answers
    expect(isAiRequestPath("/api/ai/status")).toBe(false);
    expect(isAiRequestPath("/api/accounts")).toBe(false);
    expect(isAiRequestPath("/api/aim")).toBe(false);
  });

  it("sends nothing on an AI path while AI is off, and answers 403 ai_off", async () => {
    const res = await apiFetch("/api/ai/chat", { method: "POST", body: "{}" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("ai_off");
    expect(body.error).toMatch(/Settings/);
  });

  it("holds back receipt parsing too", async () => {
    await apiFetch("/api/receipt/parse", { method: "POST" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the request once AI is on", async () => {
    localStorage.setItem(AI_ENABLED_KEY, "true");
    const res = await apiFetch("/api/ai/chat", { method: "POST" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
  });

  it("never holds back a path that spends no AI budget", async () => {
    await apiFetch("/api/ai/status");
    await apiFetch("/api/accounts");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
