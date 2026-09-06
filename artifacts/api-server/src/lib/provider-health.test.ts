// Circuit breaker + credit budget locks.
//
// The breaker is 3 failures → open, cooldown → half-open (single probe) →
// closed on success / re-open on failure. The values are documented in
// provider-health.ts; these tests lock them so an accidental "let's
// bump to 5" edit shows up as a diff here first.
//
// The cooldown is no longer flat: it starts at 60s and doubles per
// consecutive re-open to a 30-minute cap, and half-open admits exactly one
// call. Both were added on 2026-09-06 after Yahoo sat at lastOk: null for
// days — a flat 60s probe kept walking back into the same rate limit, and a
// fan-out batch was putting N calls through a "probe" and recording N
// failures. The tests below lock both.

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  registerProvider,
  withProvider,
  cooldownForFailures,
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

  it("half-open failing probe re-opens the breaker", async () => {
    for (let i = 0; i < 3; i += 1) {
      await expect(withProvider(TEST_PROVIDER, async () => { throw new Error("boom"); })).rejects.toThrow();
    }
    vi.advanceTimersByTime(61_000);
    // Failing probe. consecutiveFailures was 3, now 4 → still >= threshold, breaker re-opens.
    await expect(withProvider(TEST_PROVIDER, async () => { throw new Error("still down"); })).rejects.toThrow("still down");
    const health = getProviderHealth().find((p) => p.name === TEST_PROVIDER)!;
    expect(health.breaker).toBe("open");
  });

  it("half-open admits exactly ONE probe, not the whole fan-out batch", async () => {
    // The regression: chainFetchPrices calls withProvider once per ticker and
    // Promise.allSettles them. While the breaker read "half", every one of
    // those was admitted and every one recorded a failure — which is how
    // Yahoo reached 77 consecutive failures against a provider that was only
    // being asked once a minute.
    for (let i = 0; i < 3; i += 1) {
      await expect(withProvider(TEST_PROVIDER, async () => { throw new Error("boom"); })).rejects.toThrow();
    }
    vi.advanceTimersByTime(61_000);

    let invocations = 0;
    const batch = await Promise.allSettled(
      Array.from({ length: 15 }, () =>
        withProvider(TEST_PROVIDER, async () => {
          invocations += 1;
          throw new Error("still down");
        }),
      ),
    );
    expect(invocations, "only the probe may reach the provider").toBe(1);
    expect(batch.filter((r) => r.status === "rejected")).toHaveLength(15);

    // And the counter moved by one, not fifteen: 3 (to open) + 1 (the probe).
    const health = getProviderHealth().find((p) => p.name === TEST_PROVIDER)!;
    expect(health.consecutiveFailures).toBe(4);
  });

  it("escalates the cooldown per consecutive re-open, capped at 30 minutes", async () => {
    // Arithmetic lock. A flat cooldown is what kept re-presenting Render's
    // egress IP to a provider that was rate-limiting it.
    expect(cooldownForFailures(3)).toBe(60_000);        // first open
    expect(cooldownForFailures(4)).toBe(120_000);
    expect(cooldownForFailures(5)).toBe(240_000);
    expect(cooldownForFailures(8)).toBe(30 * 60_000);   // capped
    expect(cooldownForFailures(500)).toBe(30 * 60_000); // still finite
  });

  it("does not half-open early once the cooldown has escalated", async () => {
    for (let i = 0; i < 3; i += 1) {
      await expect(withProvider(TEST_PROVIDER, async () => { throw new Error("boom"); })).rejects.toThrow();
    }
    // First cooldown is 60s. Probe fails → failures = 4 → next cooldown 120s.
    vi.advanceTimersByTime(61_000);
    await expect(withProvider(TEST_PROVIDER, async () => { throw new Error("still down"); })).rejects.toThrow("still down");

    // 61s later the OLD flat cooldown would have elapsed. The escalated one
    // has not, so nothing may reach the provider.
    vi.advanceTimersByTime(61_000);
    let invoked = false;
    await expect(
      withProvider(TEST_PROVIDER, async () => { invoked = true; return "x"; }),
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
    expect(invoked).toBe(false);

    // Past 120s it half-opens and a success closes it.
    vi.advanceTimersByTime(60_000);
    await expect(withProvider(TEST_PROVIDER, async () => "recovered")).resolves.toBe("recovered");
    expect(getProviderHealth().find((p) => p.name === TEST_PROVIDER)!.breaker).toBe("closed");
  });

  it("releases the probe slot so a later cooldown can probe again", async () => {
    // If probeInFlight leaked on the failure path, the lane would never
    // probe again and would look permanently dead.
    for (let i = 0; i < 3; i += 1) {
      await expect(withProvider(TEST_PROVIDER, async () => { throw new Error("boom"); })).rejects.toThrow();
    }
    vi.advanceTimersByTime(61_000);
    await expect(withProvider(TEST_PROVIDER, async () => { throw new Error("down"); })).rejects.toThrow("down");
    vi.advanceTimersByTime(121_000);
    await expect(withProvider(TEST_PROVIDER, async () => "recovered")).resolves.toBe("recovered");
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
