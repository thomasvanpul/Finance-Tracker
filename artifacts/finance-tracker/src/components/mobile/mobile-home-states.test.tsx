// N5 (BACKLOG): phone HOME had no error or loading state. Every list query was
// destructured with `= []`, so a failed request rendered as a real empty ledger
// ("Nothing upcoming."), and a failed dashboard drew "0 ACCOUNTS" and a
// cashflow starting from £0. These pin the three states: pending shows a
// skeleton, failure says so, and neither prints a figure or an empty-state
// claim the API did not supply.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";

type Q = { data?: unknown; isLoading?: boolean; isError?: boolean; refetch?: () => void };
const state: Record<"dashboard" | "txns" | "subs" | "upcoming", Q> = {
  dashboard: {}, txns: {}, subs: {}, upcoming: {},
};
const q = (s: Q) => ({ isLoading: false, isError: false, refetch: () => {}, ...s });

vi.mock("@workspace/api-client-react", async (orig) => ({
  ...(await orig<object>()),
  useGetDashboard: () => q(state.dashboard),
  useListTransactions: () => q(state.txns),
  useListSubscriptions: () => q(state.subs),
  useListUpcoming: () => q(state.upcoming),
}));
vi.mock("@/lib/persona-hook", () => ({ useActivePersona: () => "full" }));
vi.mock("@/lib/market-visibility", () => ({ useMarketDataEnabled: () => false }));

const { MobileHome } = await import("./MobileHome");

const DASHBOARD = {
  netWorth: 12345.67,
  baseCurrency: "GBP",
  accountBreakdown: [{ id: 1, name: "Current", type: "cash", baseEquivalent: 12345.67 }],
  unconvertibleAccounts: 0,
  owing: { totalIOwe: 0, iOweCount: 0, topPending: [] },
  portfolio: { totalValueBase: null, unavailablePositions: 0, positionsAtCost: 0 },
};

const render = () => renderToStaticMarkup(<Router ssrPath="/"><MobileHome /></Router>);

beforeEach(() => {
  state.dashboard = { data: DASHBOARD };
  state.txns = { data: [] };
  state.subs = { data: [] };
  state.upcoming = { data: [] };
});

describe("MobileHome — pending, failed and loaded are three different screens", () => {
  it("dashboard pending: a skeleton, no account count and no empty-state claim", () => {
    state.dashboard = { isLoading: true };
    const html = render();
    expect(html).not.toContain("ACCOUNTS");
    expect(html).not.toContain("Nothing upcoming.");
    expect(html).not.toContain("£");
  });

  it("dashboard failed: a stated error with a retry, and no figure at all", () => {
    state.dashboard = { isError: true };
    const html = render();
    expect(html).toContain("COULDN&#x27;T LOAD");
    expect(html).toContain("Try again");
    expect(html).not.toContain("ACCOUNTS");
    expect(html).not.toContain("£");
    expect(html).not.toContain("Nothing upcoming.");
  });

  it("subscriptions failed: COMING says it could not load, not that nothing is coming", () => {
    state.subs = { isError: true };
    const html = render();
    expect(html).not.toContain("Nothing upcoming.");
    expect(html).toContain("Could not load what is coming.");
  });

  it("upcoming items failed: same", () => {
    state.upcoming = { isError: true };
    const html = render();
    expect(html).not.toContain("Nothing upcoming.");
    expect(html).toContain("Could not load what is coming.");
  });

  it("COMING still pending: no 'Nothing upcoming.' while it loads", () => {
    state.subs = { isLoading: true };
    expect(render()).not.toContain("Nothing upcoming.");
  });

  it("transactions failed: the cashflow section says so instead of vanishing", () => {
    state.txns = { isError: true };
    expect(render()).toContain("Could not load this month&#x27;s transactions.");
  });

  it("loaded and genuinely empty: the empty state is stated", () => {
    const html = render();
    expect(html).toContain("Nothing upcoming.");
    expect(html).not.toContain("COULDN&#x27;T LOAD");
  });
});
