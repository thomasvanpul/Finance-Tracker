import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";

// Durable mirror of the in-process circuit-breaker state kept in
// artifacts/api-server/src/lib/provider-health.ts.
//
// ── Why this exists ──────────────────────────────────────────────────────
// The breaker state lives in a module-level Map so every call reads it
// with zero latency — the right call for a per-request hot path. But
// Render's free tier sleeps at 15 min idle and restarts on every deploy,
// and a process restart wipes that Map. Diagnosed 2026-09-06 (see
// .review/archive/2026-09-06T0922-write-the-design-spec.report.md §5):
// /api/market/providers was read mid-outage showing `yahoo` at
// `consecutiveFailures: 19`, `lastOk: null` — genuine evidence of a
// days-long failure — and the SAME endpoint minutes later, after a cold
// start, showed `consecutiveFailures: 0`, `lastOk: null` again. The
// outage was still happening; the evidence of it was gone.
//
// ── What is persisted, and what is not ───────────────────────────────────
// Only the fields that are themselves evidence of an outage: the breaker
// state machine and its two timestamps. NOT persisted: the credit-budget
// counters (creditsUsedToday/creditsResetAt reset every UTC day regardless
// of process lifetime, so carrying them over buys nothing) and the
// per-minute rate-limit bookkeeping (minuteWindowStart/minuteRequests —
// deliberately not even exposed on the health endpoint, internal to
// withMinuteBudget). Restoring those would either be a no-op or actively
// wrong across a restart.
//
// ── One row per provider, upserted ───────────────────────────────────────
// Not an append-log like request_metrics — there is exactly one current
// truth per provider and the previous one has no value once superseded.
// name is the id passed to registerProvider() throughout
// provider-health.ts (yahoo, alpaca, polygon, twelvedata, frankfurter,
// groq, cerebras, …) — a plain string, not a foreign key to anything.
export const providerHealthTable = pgTable("provider_health", {
  name: text("name").primaryKey(),
  breaker: text("breaker").notNull().default("closed"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  cooldownUntil: timestamp("cooldown_until", { withTimezone: true }),
  lastOk: timestamp("last_ok", { withTimezone: true }),
  lastErrorMessage: text("last_error_message"),
  lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type ProviderHealthRow = typeof providerHealthTable.$inferSelect;
