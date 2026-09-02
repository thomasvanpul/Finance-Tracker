// Offline write queue — second IndexedDB database alongside idb-keyval's
// keyval-store. Kept separate so the outbox lifecycle (enqueue, replay,
// drop on failure) does not interact with the read-cache lifecycle
// (persist, restore, gc). Dexie is additive; idb-keyval is untouched.
//
// FX note: queued bodies arrive with nativeToBaseRate/rateAsOf absent or
// null. The server already handles this (stores null, backfill at read
// time). No FX API call happens at enqueue time — queue entries never
// block on the network.

import Dexie, { type Table } from "dexie";

export interface OutboxEntry {
  id?: number;
  createdAt: number;
  method: "POST" | "PATCH" | "DELETE";
  url: string;
  body: string | null;
  retries: number;
  lastError: string | null;
}

class NumerisOutboxDb extends Dexie {
  outbox!: Table<OutboxEntry, number>;

  constructor() {
    super("NumerisOutbox");
    this.version(1).stores({
      outbox: "++id, createdAt",
    });
  }
}

export const outboxDb = new NumerisOutboxDb();

// Thrown (not rejected) by tryOrEnqueue when a mutation is queued
// instead of sent. Call sites convert this to a success-like toast.
export class OutboxQueued extends Error {
  readonly name = "OutboxQueued";
  constructor() { super("Queued for offline sync"); }
}

export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (!navigator.onLine) return true;
  return false;
}

export async function enqueueOutbox(
  method: OutboxEntry["method"],
  url: string,
  body: unknown | null,
): Promise<void> {
  await outboxDb.outbox.add({
    createdAt: Date.now(),
    method,
    url,
    body: body != null ? JSON.stringify(body) : null,
    retries: 0,
    lastError: null,
  });
}

export async function getPendingCount(): Promise<number> {
  return outboxDb.outbox.count();
}

export async function replayOutbox(
  onSuccess: (count: number) => void,
  onPermFailure: () => void,
): Promise<void> {
  const entries = await outboxDb.outbox.orderBy("id").toArray();
  if (entries.length === 0) return;

  // Import at runtime to avoid circular deps. customFetch already has
  // the base-URL and auth-token getter configured by main.tsx.
  const { customFetch } = await import("@workspace/api-client-react");

  let successCount = 0;
  for (const entry of entries) {
    try {
      await customFetch(entry.url, {
        method: entry.method,
        body: entry.body ?? undefined,
        headers: entry.body != null ? { "Content-Type": "application/json" } : {},
      });
      await outboxDb.outbox.delete(entry.id!);
      successCount++;
    } catch (err: unknown) {
      const isTransient = isTransientError(err);
      if (isTransient) {
        await outboxDb.outbox.update(entry.id!, {
          retries: entry.retries + 1,
          lastError: err instanceof Error ? err.message : String(err),
        });
        // Stop processing — later entries may depend on this one.
        break;
      } else {
        // Permanent 4xx: drop the entry, notify, continue draining.
        await outboxDb.outbox.delete(entry.id!);
        onPermFailure();
      }
    }
  }
  if (successCount > 0) onSuccess(successCount);
}

function isTransientError(err: unknown): boolean {
  if (err instanceof TypeError) return true; // network failure
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status: number }).status;
    if (status === 429 || status >= 500) return true;
  }
  return false;
}
