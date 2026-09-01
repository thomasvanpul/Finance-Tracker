// Behavioural locks on the request_metrics middleware.
//
// The three properties worth asserting mechanically:
//   1. /api/healthz is never recorded — cron-job.org hits it ~1440 times/day
//      and its p95 lives in the pinger's own history. Including it would
//      drown the real-endpoint signal and waste ~43k rows/mo.
//   2. Non-/api paths are never recorded — the SPA static files are HTTP-
//      cache work, not application work.
//   3. The insert fires on res.on('finish'), not synchronously on request —
//      metrics capture MUST NOT be able to fail a request or delay a
//      response. A DB write of unknown latency inside the request path
//      would violate that.
//
// The insert values themselves (route, method, statusCode, durationMs,
// userId) are simple mappings from req/res properties; the risk is
// wiring, not derivation. Tests assert wiring.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @workspace/db BEFORE importing the middleware. Capture the
// values passed to insert().values(...) so the test can assert on them.
const insertCalls: Array<Record<string, unknown>> = [];
const insertMock = vi.fn(() => ({
  values: vi.fn((v: Record<string, unknown>) => {
    insertCalls.push(v);
    return { catch: vi.fn(() => Promise.resolve()) };
  }),
}));
vi.mock("@workspace/db", () => ({
  db: { insert: insertMock, delete: vi.fn() },
  requestMetricsTable: { __table: "request_metrics" },
}));
// pino writes to stdout in tests — silence it so failure output
// isn't polluted.
vi.mock("./logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

const { requestMetricsMiddleware } = await import("./request-metrics");

// Minimal Express-like req/res doubles. We only need originalUrl,
// method, res.statusCode, res.on('finish') and (optionally)
// req.route.path + req.userId.
function makeReqRes(opts: {
  originalUrl: string;
  method?: string;
  routeTemplate?: string;
  userId?: string;
  statusCode?: number;
}): {
  req: unknown;
  res: {
    statusCode: number;
    on: (event: string, cb: () => void) => void;
    emit: (event: string) => void;
  };
} {
  const listeners: Record<string, Array<() => void>> = {};
  const res = {
    statusCode: opts.statusCode ?? 200,
    on: (event: string, cb: () => void) => {
      (listeners[event] ??= []).push(cb);
    },
    emit: (event: string) => {
      (listeners[event] ?? []).forEach((cb) => cb());
    },
  };
  const req: Record<string, unknown> = {
    originalUrl: opts.originalUrl,
    method: opts.method ?? "GET",
  };
  if (opts.routeTemplate !== undefined) {
    req.route = { path: opts.routeTemplate };
  }
  if (opts.userId !== undefined) {
    req.userId = opts.userId;
  }
  return { req, res };
}

beforeEach(() => {
  insertCalls.length = 0;
  insertMock.mockClear();
});

// ── (1) Skipped paths ───────────────────────────────────────────────────────

describe("requestMetricsMiddleware · what it skips", () => {
  it("does NOT record /api/healthz — pinger hits it every minute and its p95 is tracked from the pinger's history", () => {
    const { req, res } = makeReqRes({ originalUrl: "/api/healthz" });
    const next = vi.fn();
    requestMetricsMiddleware(req as never, res as never, next);
    res.emit("finish");
    expect(insertMock).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it("does NOT record non-/api paths — the SPA static files are HTTP-cache work, not application work", () => {
    const { req, res } = makeReqRes({ originalUrl: "/index.html" });
    const next = vi.fn();
    requestMetricsMiddleware(req as never, res as never, next);
    res.emit("finish");
    expect(insertMock).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it("does NOT record /api/healthz even when its query string differs", () => {
    const { req, res } = makeReqRes({ originalUrl: "/api/healthz?probe=1" });
    const next = vi.fn();
    requestMetricsMiddleware(req as never, res as never, next);
    res.emit("finish");
    expect(insertMock).not.toHaveBeenCalled();
  });
});

// ── (2) Insert wiring ──────────────────────────────────────────────────────

describe("requestMetricsMiddleware · what it records", () => {
  it("fires the insert on res.on('finish'), NOT synchronously on the request path", () => {
    const { req, res } = makeReqRes({ originalUrl: "/api/settings/currency", routeTemplate: "/settings/currency" });
    const next = vi.fn();
    requestMetricsMiddleware(req as never, res as never, next);
    // Response hasn't finished yet — the insert must not have fired.
    expect(insertMock).not.toHaveBeenCalled();
    res.emit("finish");
    expect(insertMock).toHaveBeenCalledOnce();
  });

  it("records the parameterised route template when Express matched — not the raw URL — so cardinality stays bounded", () => {
    const { req, res } = makeReqRes({
      originalUrl: "/api/accounts/47",
      routeTemplate: "/accounts/:id",
    });
    const next = vi.fn();
    requestMetricsMiddleware(req as never, res as never, next);
    res.emit("finish");
    expect(insertCalls[0]?.route).toBe("/accounts/:id");
  });

  it("falls back to the raw path when Express did NOT match — so 404s still surface in the table", () => {
    const { req, res } = makeReqRes({ originalUrl: "/api/not-a-real-route?x=1", statusCode: 404 });
    const next = vi.fn();
    requestMetricsMiddleware(req as never, res as never, next);
    res.emit("finish");
    expect(insertCalls[0]?.route).toBe("/api/not-a-real-route");
    expect(insertCalls[0]?.statusCode).toBe(404);
  });

  it("captures userId when requireAuth has populated req.userId", () => {
    const { req, res } = makeReqRes({
      originalUrl: "/api/accounts",
      routeTemplate: "/accounts",
      userId: "usr_123",
    });
    const next = vi.fn();
    requestMetricsMiddleware(req as never, res as never, next);
    res.emit("finish");
    expect(insertCalls[0]?.userId).toBe("usr_123");
  });

  it("records userId as null on public routes where requireAuth has NOT run", () => {
    const { req, res } = makeReqRes({
      originalUrl: "/api/auth-providers",
      routeTemplate: "/auth-providers",
    });
    const next = vi.fn();
    requestMetricsMiddleware(req as never, res as never, next);
    res.emit("finish");
    expect(insertCalls[0]?.userId).toBeNull();
  });

  it("carries the response statusCode from res.statusCode at the moment finish fires", () => {
    const { req, res } = makeReqRes({
      originalUrl: "/api/accounts",
      routeTemplate: "/accounts",
      statusCode: 500,
    });
    const next = vi.fn();
    requestMetricsMiddleware(req as never, res as never, next);
    res.emit("finish");
    expect(insertCalls[0]?.statusCode).toBe(500);
  });

  it("records durationMs as a non-negative integer", () => {
    const { req, res } = makeReqRes({
      originalUrl: "/api/accounts",
      routeTemplate: "/accounts",
    });
    const next = vi.fn();
    requestMetricsMiddleware(req as never, res as never, next);
    res.emit("finish");
    const durationMs = insertCalls[0]?.durationMs;
    expect(typeof durationMs).toBe("number");
    expect(durationMs).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(durationMs)).toBe(true);
  });
});
