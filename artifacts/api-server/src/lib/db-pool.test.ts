import { describe, expect, it, vi } from "vitest";

// The shared pool once had no timeouts at all (finding eeae05e87d22): with
// connectionTimeoutMillis at pg's default of 0, a request waiting for a
// client waits forever, and the local API was seen to hang every DB-backed
// route — sign-in included — for 130s while /api/healthz answered. A pool
// with no 'error' listener also lets one idle client dropped by Neon take
// the whole process down. Constructing a Pool opens no connection, so the
// real module can be imported here with a placeholder URL.
process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:1/test";
const { pool } = await import("@workspace/db");

describe("shared pg pool", () => {
  it("bounds the wait for a client", () => {
    expect(pool.options.connectionTimeoutMillis).toBeGreaterThan(0);
  });

  it("closes idle clients and keeps live ones' sockets alive", () => {
    expect(pool.options.idleTimeoutMillis).toBeGreaterThan(0);
    expect(pool.options.keepAlive).toBe(true);
  });

  it("survives an error on an idle client instead of crashing", () => {
    expect(pool.listenerCount("error")).toBeGreaterThan(0);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => pool.emit("error", new Error("terminating connection"))).not.toThrow();
    spy.mockRestore();
  });
});
