// GET /net-worth/history: validates `days`, reads in the user's current
// base currency, and returns the series in the spec's shape.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

const readMock = vi.fn(async (_u: string, base: string, _days: number) => ({
  baseCurrency: base,
  dataAvailableSince: "2026-10-01",
  daysInOtherCurrency: 0,
  points: [{ date: "2026-10-01", netWorth: 1200, assets: 900, portfolio: 500, liabilities: 200, owingNet: 0, partial: false }],
}));
vi.mock("../lib/net-worth-snapshots", () => ({
  readNetWorthHistory: (u: string, b: string, d: number) => readMock(u, b, d),
}));
vi.mock("../lib/app-settings-db", () => ({ getBaseCurrency: async () => "GBP" }));

let server: Server;
let baseUrl = "";

beforeAll(async () => {
  const express = (await import("express")).default;
  const app = express();
  app.use((req, _res, next) => {
    (req as unknown as { userId: string }).userId = "user-a";
    next();
  });
  app.use((await import("./net-worth-history")).default);
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => readMock.mockClear());

describe("GET /net-worth/history", () => {
  it("defaults to a year in the user's base currency", async () => {
    const res = await fetch(`${baseUrl}/net-worth/history`);
    expect(res.status).toBe(200);
    expect(readMock).toHaveBeenCalledWith("user-a", "GBP", 365);
    const body = (await res.json()) as { points: unknown[]; baseCurrency: string };
    expect(body.baseCurrency).toBe("GBP");
    expect(body.points).toHaveLength(1);
  });

  it("takes a days window", async () => {
    await fetch(`${baseUrl}/net-worth/history?days=30`);
    expect(readMock).toHaveBeenCalledWith("user-a", "GBP", 30);
  });

  it.each(["0", "3651", "7.5", "-1", "abc"])("rejects days=%s", async (days) => {
    const res = await fetch(`${baseUrl}/net-worth/history?days=${days}`);
    expect(res.status).toBe(400);
    expect(readMock).not.toHaveBeenCalled();
  });
});
