// Circuit breaker + credit budget locks.
//
// The breaker is 3 failures → open, 60s cooldown → half-open (probe) →
// closed on success / re-open on failure. The values are documented in
// provider-health.ts; these tests lock them so an accidental "let's
// bump to 5" edit shows up as a diff here first.

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  registerProvider,
  withProvider,
  getProviderHealth,
  ProviderUnavailableError,
  CreditBudgetExhaustedError,
  __resetProviderHealthForTesting,
} from "./provider-health";

// Use a test-only provider name so no other test's registration state
// interferes. registerProvider is idempotent for re-registration.
const TEST_PROVIDER = "test-breaker";
const TEST_BUDGET_PROVIDER = "test-budget";

beforeEach(() => {
  __resetProviderHealthForTesting();
  registerProvider({ name: TEST_PROVIDER, configured: true });
  registerProvider({ name: TEST_BUDGET_PROVIDER, configured: true, creditsBudget: 100 });
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("circuit breaker", () => {
  it("stays closed while calls succeed", async () => {
    for (let i = 0; i < 5; i += 1) {
      const r = await withProvider(TEST_PROVIDER, async () => "ok");
      expect(r).toBe("ok");
    }
    const health = getProviderHealth().find((p) => p.name === TEST_PROVIDER)!;
    expect(health.breaker).toBe("closed");
    expect(health.consecutiveFailures).toBe(0);
  });

  it("resets consecutive failures on any success", async () => {
    // Two fails, one success, health.consecutiveFailures should be 0.
    for (let i = 0; i < 2; i += 1) {
      await expect(withProvider(TEST_PROVIDER, async () => { throw new Error("boom"); })).rejects.toThrow();
    }
    await withProvider(TEST_PROVIDER, async () => "recovered");
    const health = getProviderHealth().find((p) => p.name === TEST_PROVIDER)!;
    expect(health.consecutiveFailures).toBe(0);
    expect(health.breaker).toBe("closed");
  });

  it("opens after 3 consecutive failures and rejects subsequent calls without invoking fn", async () => {
    for (let i = 0; i < 3; i += 1) {
      await expect(withProvider(TEST_PROVIDER, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    }
    // Fourth call must throw ProviderUnavailableError WITHOUT running fn.
    let invoked = false;
    await expect(
      withProvider(TEST_PROVIDER, async () => { invoked = true; return "unreachable"; })
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(invoked, "fn must NOT be called while breaker is open").toBe(false);
    const health = getProviderHealth().find((p) => p.name === TEST_PROVIDER)!;
    expect(health.breaker).toBe("open");
    expect(health.cooldownUntil).not.toBeNull();
  });

  it("half-opens after 60s cooldown; success closes; failure re-opens", async () => {
    // Trip the breaker.
    for (let i = 0; i < 3; i += 1) {
      await expect(withProvider(TEST_PROVIDER, async () => { throw new Error("boom"); })).rejects.toThrow();
    }
    expect(getProviderHealth().find((p) => p.name === TEST_PROVIDER)!.breaker).toBe("open");

    // 30s later — still open.
    vi.advanceTimersByTime(30_000);
    await expect(withProvider(TEST_PROVIDER, async () => "probe")).rejects.toBeInstanceOf(ProviderUnavailableError);

    // 61s from open — cooldown elapsed. First call is the probe.
    vi.advanceTimersByTime(31_000);
    // Successful probe → closed, counter reset.
    const r = await withProvider(TEST_PROVIDER, async () => "recovered");
    expect(r).toBe("recovered");
    const health = getProviderHealth().find((p) => p.name === TEST_PROVIDER)!;
    expect(health.breaker).toBe("closed");
    expect(health.consecutiveFailures).toBe(0);
  });

  it("half-open failing probe re-opens the breaker for another 60s", async () => {
    for (let i = 0; i < 3; i += 1) {
      await expect(withProvider(TEST_PROVIDER, async () => { throw new Error("boom"); })).rejects.toThrow();
    }
    vi.advanceTimersByTime(61_000);
    // Failing probe. consecutiveFailures was 3, now 4 → still >= threshold, breaker re-opens.
    await expect(withProvider(TEST_PROVIDER, async () => { throw new Error("still down"); })).rejects.toThrow("still down");
    const health = getProviderHealth().find((p) => p.name === TEST_PROVIDER)!;
    expect(health.breaker).toBe("open");
  });
});

describe("credit budget", () => {
  it("counts credits toward the daily budget", async () => {
    await withProvider(TEST_BUDGET_PROVIDER, async () => "ok", { credits: 20 });
    await withProvider(TEST_BUDGET_PROVIDER, async () => "ok", { credits: 30 });
    const health = getProviderHealth().find((p) => p.name === TEST_BUDGET_PROVIDER)!;
    expect(health.creditsUsedToday).toBe(50);
    expect(health.creditsBudget).toBe(100);
  });

  it("stops at 95% of the daily budget rather than exceed the ceiling", async () => {
    // Soft cap = floor(100 * 0.95) = 95. A 40-credit request when
    // 60 have been spent (60+40=100) exceeds the soft cap → throw.
    await withProvider(TEST_BUDGET_PROVIDER, async () => "ok", { credits: 60 });
    await expect(
      withProvider(TEST_BUDGET_PROVIDER, async () => "ok", { credits: 40 })
    ).rejects.toBeInstanceOf(CreditBudgetExhaustedError);
    // The rejected call must NOT increment the counter.
    const health = getProviderHealth().find((p) => p.name === TEST_BUDGET_PROVIDER)!;
    expect(health.creditsUsedToday).toBe(60);
  });

  it("resets the budget at UTC midnight", async () => {
    await withProvider(TEST_BUDGET_PROVIDER, async () => "ok", { credits: 80 });
    // Advance past next UTC midnight. Exact hours depend on the current
    // instant; 25 hours is enough to cross any midnight.
    vi.advanceTimersByTime(25 * 60 * 60 * 1000);
    // A next call should succeed (budget reset internally on the check).
    await withProvider(TEST_BUDGET_PROVIDER, async () => "ok", { credits: 5 });
    const health = getProviderHealth().find((p) => p.name === TEST_BUDGET_PROVIDER)!;
    // Budget reset then 5 credits spent → 5, not 85.
    expect(health.creditsUsedToday).toBe(5);
  });
});

describe("configured gate", () => {
  it("refuses to call fn when configured=false and requireConfigured is on", async () => {
    registerProvider({ name: "test-unconfigured", configured: false });
    let invoked = false;
    await expect(
      withProvider("test-unconfigured", async () => { invoked = true; return "unreachable"; })
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(invoked).toBe(false);
  });

  it("surfaces the reason in the health snapshot rather than hiding the provider", async () => {
    registerProvider({ name: "test-unconfigured", configured: false });
    const health = getProviderHealth().find((p) => p.name === "test-unconfigured");
    // Provider present in health list even when unconfigured — operator
    // sees "provider offline: no key" rather than the provider silently
    // missing from the endpoint response.
    expect(health).toBeDefined();
    expect(health!.configured).toBe(false);
  });
});
