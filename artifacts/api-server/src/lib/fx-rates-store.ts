// Keeps every ECB fixing getFxRates fetches in fx_rates (BACKLOG J28;
// schema and reasoning in lib/db/src/schema/fx-rates.ts).
//
// Fire-and-forget: a failed write is logged and never fails or delays the
// conversion that triggered it. The rate in hand is real either way; the
// table is the record of it, not the source of it.
//
// @workspace/db is imported lazily, guarded on DATABASE_URL, for the same
// reason as lib/provider-health.ts: market.ts is loaded by plain unit tests
// with no database, and @workspace/db throws at module load without one.

import { logger } from "./logger";

let dbModulePromise: Promise<typeof import("@workspace/db")> | null = null;

export function persistEcbFixing(date: string, base: string, rates: Record<string, number>): void {
  const entries = Object.entries(rates);
  if (!process.env.DATABASE_URL || entries.length === 0) return;
  dbModulePromise ??= import("@workspace/db");
  dbModulePromise
    .then(({ db, fxRatesTable }) =>
      db
        .insert(fxRatesTable)
        .values(entries.map(([quote, rate]) => ({ date, base, quote, rate: String(rate), provider: "ecb" })))
        .onConflictDoNothing(),
    )
    .catch((err: unknown) => {
      logger.warn({ err: err instanceof Error ? err.message : String(err), date }, "fx_rates: storing the ECB fixing failed");
    });
}
