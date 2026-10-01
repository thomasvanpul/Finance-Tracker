import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Every wait is bounded. pg's default connectionTimeoutMillis is 0, which
// waits for a free client forever: the local API was once seen hanging every
// DB-backed route, sign-in included, for 130s while /api/healthz answered.
// A bounded wait turns that into an error the request can report.
const CONNECTION_TIMEOUT_MS = 10_000; // covers a Neon compute waking from suspend
const IDLE_TIMEOUT_MS = 10_000;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  idleTimeoutMillis: IDLE_TIMEOUT_MS,
  // TCP keepalive, so a socket the far end dropped is noticed rather than
  // left looking idle.
  keepAlive: true,
});

// An idle client the server terminates (Neon does this when a compute
// suspends) is emitted here. With no listener, Node throws it and the process
// exits. The pool has already discarded the client, so logging is enough.
pool.on("error", (err) => {
  console.error("[db] idle client error:", err.message);
});
export const db = drizzle(pool, { schema });

export * from "./schema";
